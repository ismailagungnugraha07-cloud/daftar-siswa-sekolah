const express = require("express");
const db = require("../config/database");
const { auth, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.use(auth);

const MAX_OPTIONS = 5;

function fail(res, status, message) {
    return res.status(status).json({ status: "error", message });
}

function getAssignment(id) {
    return db.prepare(`
        SELECT a.id, a.guru_id, a.kelas_id, a.batas_waktu, a.judul, c.wali_kelas_id
        FROM assignments a
        LEFT JOIN classes c ON c.id = a.kelas_id
        WHERE a.id = ?
    `).get(id);
}

function getStudent(userId) {
    return db.prepare("SELECT id, kelas_id FROM students WHERE user_id = ?").get(userId);
}

function submissionStatus(deadline) {
    if (!deadline) return "terkirim";

    const date = new Date(String(deadline).replace(" ", "T"));

    if (Number.isNaN(date.getTime())) return "terkirim";

    return Date.now() > date.getTime() ? "terlambat" : "terkirim";
}

function parseOptions(raw) {
    try {
        const list = JSON.parse(raw);

        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

// Siapa yang boleh mengelola / melihat soal beserta kunci jawaban
function canManage(user, assignment) {
    return user.role === "admin" || (user.role === "guru" && assignment.guru_id === user.id);
}

function canView(user, assignment) {
    if (canManage(user, assignment)) return true;
    if (user.role === "wali_kelas") return assignment.wali_kelas_id === user.id;

    if (user.role === "siswa") {
        const student = getStudent(user.id);

        return Boolean(student) && student.kelas_id === assignment.kelas_id;
    }

    return false;
}

function validateQuestion(body) {
    const tipe = body.tipe;
    const pertanyaan = String(body.pertanyaan || "").trim();
    const bobot = body.bobot === undefined || body.bobot === "" ? 1 : Number(body.bobot);

    if (!["pilihan_ganda", "esai"].includes(tipe)) {
        return { error: "Tipe soal harus pilihan_ganda atau esai" };
    }

    if (!pertanyaan || pertanyaan.length > 1000) {
        return { error: "Pertanyaan wajib diisi (maksimal 1000 karakter)" };
    }

    if (!Number.isInteger(bobot) || bobot < 1 || bobot > 100) {
        return { error: "Bobot harus bilangan bulat 1 sampai 100" };
    }

    if (tipe === "esai") {
        return { value: { tipe, pertanyaan, opsi: null, jawaban_benar: null, bobot } };
    }

    if (!Array.isArray(body.opsi)) {
        return { error: "Opsi jawaban wajib diisi" };
    }

    const opsi = body.opsi.map((item) => String(item ?? "").trim());

    if (opsi.length < 2 || opsi.length > MAX_OPTIONS || opsi.some((item) => !item || item.length > 300)) {
        return { error: "Pilihan ganda butuh 2 sampai 5 opsi yang terisi (maksimal 300 karakter)" };
    }

    const benar = Number(body.jawaban_benar);

    if (!Number.isInteger(benar) || benar < 0 || benar >= opsi.length) {
        return { error: "Pilih kunci jawaban yang benar" };
    }

    return { value: { tipe, pertanyaan, opsi: JSON.stringify(opsi), jawaban_benar: benar, bobot } };
}

function formatQuestion(row, withKey) {
    const item = {
        id: row.id,
        tugas_id: row.tugas_id,
        tipe: row.tipe,
        pertanyaan: row.pertanyaan,
        opsi: row.opsi ? parseOptions(row.opsi) : [],
        bobot: row.bobot
    };

    if (withKey) {
        item.jawaban_benar = row.jawaban_benar;
        item.jumlah_dijawab = row.jumlah_dijawab ?? 0;
    }

    return item;
}

// Jumlah soal per tugas (agar halaman siswa tahu tugas mana yang berupa soal)
router.get("/counts", (req, res) => {
    const rows = db.prepare("SELECT tugas_id, COUNT(*) AS jumlah FROM questions GROUP BY tugas_id").all();
    const counts = {};

    rows.forEach((row) => { counts[row.tugas_id] = row.jumlah; });

    res.json({ status: "success", counts });
});

// Daftar soal sebuah tugas
router.get("/", (req, res) => {
    const assignmentId = Number(req.query.assignment_id);

    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
        return fail(res, 400, "ID tugas tidak valid");
    }

    const assignment = getAssignment(assignmentId);

    if (!assignment) return fail(res, 404, "Tugas tidak ditemukan");
    if (!canView(req.user, assignment)) return fail(res, 403, "Kamu tidak memiliki akses");

    const manage = canManage(req.user, assignment);

    const rows = db.prepare(`
        SELECT q.*, (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id) AS jumlah_dijawab
        FROM questions q WHERE q.tugas_id = ? ORDER BY q.id
    `).all(assignmentId);

    const response = {
        status: "success",
        questions: rows.map((row) => formatQuestion(row, manage))
    };

    if (req.user.role === "siswa") {
        const student = getStudent(req.user.id);
        const submission = db.prepare(
            "SELECT id, status FROM submissions WHERE tugas_id = ? AND siswa_id = ?"
        ).get(assignmentId, student.id);

        response.submission = null;

        if (submission) {
            const answers = {};

            db.prepare("SELECT question_id, jawaban FROM answers WHERE submission_id = ?")
                .all(submission.id)
                .forEach((a) => { answers[a.question_id] = a.jawaban; });

            const graded = db.prepare("SELECT id FROM grades WHERE submission_id = ?").get(submission.id);

            response.submission = { id: submission.id, status: submission.status, answers, graded: Boolean(graded) };
        }
    }

    res.json(response);
});

router.post("/", allowRoles("admin", "guru"), (req, res) => {
    const assignment = getAssignment(Number(req.body.tugas_id));

    if (!assignment) return fail(res, 404, "Tugas tidak ditemukan");
    if (!canManage(req.user, assignment)) return fail(res, 403, "Kamu hanya bisa menambah soal pada tugas milik sendiri");

    const checked = validateQuestion(req.body);

    if (checked.error) return fail(res, 400, checked.error);

    const q = checked.value;
    const result = db.prepare(`
        INSERT INTO questions (tugas_id, tipe, pertanyaan, opsi, jawaban_benar, bobot)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(assignment.id, q.tipe, q.pertanyaan, q.opsi, q.jawaban_benar, q.bobot);

    res.status(201).json({ status: "success", message: "Soal berhasil ditambahkan", id: result.lastInsertRowid });
});

// Tambah banyak soal sekaligus (semua berhasil atau semua dibatalkan)
router.post("/bulk", allowRoles("admin", "guru"), (req, res) => {
    const assignment = getAssignment(Number(req.body.tugas_id));

    if (!assignment) return fail(res, 404, "Tugas tidak ditemukan");
    if (!canManage(req.user, assignment)) return fail(res, 403, "Kamu hanya bisa menambah soal pada tugas milik sendiri");

    const list = req.body.questions;

    if (!Array.isArray(list) || !list.length) return fail(res, 400, "Daftar soal kosong");
    if (list.length > 100) return fail(res, 400, "Maksimal 100 soal sekali tambah");

    const prepared = [];

    for (let i = 0; i < list.length; i++) {
        const checked = validateQuestion(list[i] || {});

        if (checked.error) return fail(res, 400, "Soal nomor " + (i + 1) + ": " + checked.error);

        prepared.push(checked.value);
    }

    const insert = db.prepare(`
        INSERT INTO questions (tugas_id, tipe, pertanyaan, opsi, jawaban_benar, bobot)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
        prepared.forEach((q) => insert.run(assignment.id, q.tipe, q.pertanyaan, q.opsi, q.jawaban_benar, q.bobot));
    })();

    res.status(201).json({
        status: "success",
        message: prepared.length + " soal berhasil ditambahkan",
        jumlah: prepared.length
    });
});

router.put("/:id", allowRoles("admin", "guru"), (req, res) => {
    const question = db.prepare("SELECT * FROM questions WHERE id = ?").get(Number(req.params.id));

    if (!question) return fail(res, 404, "Soal tidak ditemukan");

    const assignment = getAssignment(question.tugas_id);

    if (!canManage(req.user, assignment)) return fail(res, 403, "Kamu hanya bisa mengubah soal milik sendiri");

    const checked = validateQuestion(req.body);

    if (checked.error) return fail(res, 400, checked.error);

    const q = checked.value;
    const answered = db.prepare("SELECT COUNT(*) AS n FROM answers WHERE question_id = ?").get(question.id).n;

    if (answered > 0 && (
        q.tipe !== question.tipe || q.opsi !== question.opsi ||
        q.jawaban_benar !== question.jawaban_benar || q.bobot !== question.bobot
    )) {
        return fail(res, 409, "Soal sudah dijawab siswa. Hanya teks pertanyaan yang boleh diubah.");
    }

    db.prepare(`
        UPDATE questions SET tipe = ?, pertanyaan = ?, opsi = ?, jawaban_benar = ?, bobot = ? WHERE id = ?
    `).run(q.tipe, q.pertanyaan, q.opsi, q.jawaban_benar, q.bobot, question.id);

    res.json({ status: "success", message: "Soal berhasil diperbarui" });
});

router.delete("/:id", allowRoles("admin", "guru"), (req, res) => {
    const question = db.prepare("SELECT * FROM questions WHERE id = ?").get(Number(req.params.id));

    if (!question) return fail(res, 404, "Soal tidak ditemukan");

    const assignment = getAssignment(question.tugas_id);

    if (!canManage(req.user, assignment)) return fail(res, 403, "Kamu hanya bisa menghapus soal milik sendiri");

    const answered = db.prepare("SELECT COUNT(*) AS n FROM answers WHERE question_id = ?").get(question.id).n;

    if (answered > 0) return fail(res, 409, "Soal sudah dijawab siswa dan tidak bisa dihapus");

    db.prepare("DELETE FROM questions WHERE id = ?").run(question.id);

    res.json({ status: "success", message: "Soal berhasil dihapus" });
});

// Siswa mengirim jawaban soal
router.post("/submit", allowRoles("siswa"), (req, res) => {
    const assignment = getAssignment(Number(req.body.tugas_id));

    if (!assignment) return fail(res, 404, "Tugas tidak ditemukan");

    const student = getStudent(req.user.id);

    if (!student || student.kelas_id !== assignment.kelas_id) {
        return fail(res, 403, "Tugas ini bukan untuk kelasmu");
    }

    const questions = db.prepare("SELECT * FROM questions WHERE tugas_id = ? ORDER BY id").all(assignment.id);

    if (!questions.length) return fail(res, 400, "Tugas ini tidak memiliki soal");

    const input = req.body.answers && typeof req.body.answers === "object" ? req.body.answers : {};
    const cleaned = [];

    for (const q of questions) {
        const raw = input[q.id];

        if (raw === undefined || raw === null || raw === "") {
            cleaned.push({ q, value: null });
            continue;
        }

        if (q.tipe === "pilihan_ganda") {
            const index = Number(raw);

            if (!Number.isInteger(index) || index < 0 || index >= parseOptions(q.opsi).length) {
                return fail(res, 400, "Jawaban pilihan ganda tidak valid");
            }

            cleaned.push({ q, value: String(index) });
        } else {
            const text = String(raw).trim();

            if (text.length > 5000) return fail(res, 400, "Jawaban esai maksimal 5000 karakter");

            cleaned.push({ q, value: text || null });
        }
    }

    if (cleaned.every((item) => item.value === null)) {
        return fail(res, 400, "Jawab minimal satu soal terlebih dahulu");
    }

    const existing = db.prepare(
        "SELECT id FROM submissions WHERE tugas_id = ? AND siswa_id = ?"
    ).get(assignment.id, student.id);

    if (existing && db.prepare("SELECT id FROM grades WHERE submission_id = ?").get(existing.id)) {
        return fail(res, 409, "Jawabanmu sudah dinilai dan tidak bisa diubah");
    }

    const hasEssay = questions.some((q) => q.tipe === "esai");
    const pgQuestions = questions.filter((q) => q.tipe === "pilihan_ganda");
    let autoGrade = null;

    db.transaction(() => {
        const status = submissionStatus(assignment.batas_waktu);
        let submissionId;

        if (existing) {
            submissionId = existing.id;
            db.prepare("UPDATE submissions SET status = ? WHERE id = ?").run(status, submissionId);
            db.prepare("DELETE FROM answers WHERE submission_id = ?").run(submissionId);
        } else {
            submissionId = db.prepare(`
                INSERT INTO submissions (tugas_id, siswa_id, status) VALUES (?, ?, ?)
            `).run(assignment.id, student.id, status).lastInsertRowid;
        }

        const insert = db.prepare("INSERT INTO answers (submission_id, question_id, jawaban) VALUES (?, ?, ?)");

        cleaned.forEach(({ q, value }) => insert.run(submissionId, q.id, value));

        // Tugas pilihan ganda saja -> dinilai otomatis
        if (!hasEssay && pgQuestions.length) {
            const total = pgQuestions.reduce((sum, q) => sum + q.bobot, 0);
            const earned = cleaned.reduce((sum, { q, value }) =>
                sum + (value !== null && Number(value) === q.jawaban_benar ? q.bobot : 0), 0);

            autoGrade = Math.round((earned / total) * 10000) / 100;

            db.prepare(`
                INSERT INTO grades (submission_id, nilai, komentar) VALUES (?, ?, ?)
                ON CONFLICT(submission_id) DO UPDATE SET nilai = excluded.nilai, komentar = excluded.komentar
            `).run(submissionId, autoGrade, "Dinilai otomatis (pilihan ganda)");
        }
    })();

    res.status(201).json({
        status: "success",
        message: autoGrade !== null
            ? "Jawaban terkirim dan dinilai otomatis"
            : "Jawaban terkirim, menunggu penilaian guru",
        nilai: autoGrade
    });
});

// Jawaban siswa pada sebuah pengumpulan (untuk guru / wali kelas / siswa pemilik)
router.get("/answers", (req, res) => {
    const submissionId = Number(req.query.submission_id);

    if (!Number.isInteger(submissionId) || submissionId <= 0) {
        return fail(res, 400, "ID pengumpulan tidak valid");
    }

    const submission = db.prepare(`
        SELECT sub.id, sub.tugas_id, st.user_id AS siswa_user_id
        FROM submissions sub JOIN students st ON st.id = sub.siswa_id
        WHERE sub.id = ?
    `).get(submissionId);

    if (!submission) return fail(res, 404, "Pengumpulan tidak ditemukan");

    const assignment = getAssignment(submission.tugas_id);
    const own = req.user.role === "siswa" && submission.siswa_user_id === req.user.id;
    const staff = req.user.role !== "siswa" && canView(req.user, assignment);

    if (!own && !staff) return fail(res, 403, "Kamu tidak memiliki akses");

    const showKey = staff;
    const rows = db.prepare(`
        SELECT q.*, a.jawaban
        FROM questions q
        LEFT JOIN answers a ON a.question_id = q.id AND a.submission_id = ?
        WHERE q.tugas_id = ? ORDER BY q.id
    `).all(submissionId, submission.tugas_id);

    let total = 0;
    let earned = 0;

    const items = rows.map((row) => {
        const item = formatQuestion(row, false);

        item.jawaban = row.jawaban;

        if (row.tipe === "pilihan_ganda") {
            const correct = row.jawaban !== null && Number(row.jawaban) === row.jawaban_benar;

            total += row.bobot;
            if (correct) earned += row.bobot;

            if (showKey) {
                item.jawaban_benar = row.jawaban_benar;
                item.benar = correct;
            }
        }

        return item;
    });

    res.json({
        status: "success",
        questions: items,
        skor_pg: showKey && total ? Math.round((earned / total) * 10000) / 100 : null
    });
});

module.exports = router;
