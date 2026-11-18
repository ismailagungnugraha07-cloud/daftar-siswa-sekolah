const express = require("express");
const db = require("../config/database");
const { auth, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.use(auth);

function getGrade(id) {
    return db.prepare(`
        SELECT
            g.id, g.submission_id, g.nilai, g.komentar, g.created_at,
            a.id AS assignment_id, a.judul,
            s.nama_mapel, c.nama_kelas, c.id AS kelas_id,
            st.nis, u.nama AS siswa_nama,
            gu.nama AS guru_nama
        FROM grades g
        JOIN submissions sub ON sub.id = g.submission_id
        JOIN assignments a ON a.id = sub.tugas_id
        JOIN students st ON st.id = sub.siswa_id
        JOIN users u ON u.id = st.user_id
        LEFT JOIN subjects s ON s.id = a.subject_id
        LEFT JOIN classes c ON c.id = a.kelas_id
        LEFT JOIN users gu ON gu.id = a.guru_id
        WHERE g.id = ?
    `).get(id);
}

// Menampilkan nilai sesuai role
router.get("/", (req, res) => {
    try {
        const conditions = [];
        const params = [];

        let sql = `
            SELECT
                g.id, g.submission_id, g.nilai, g.komentar, g.created_at,
                a.id AS assignment_id, a.judul,
                s.nama_mapel, c.nama_kelas, c.id AS kelas_id,
                st.id AS student_id, st.nis,
                u.nama AS siswa_nama,
                gu.nama AS guru_nama
            FROM grades g
            JOIN submissions sub ON sub.id = g.submission_id
            JOIN assignments a ON a.id = sub.tugas_id
            JOIN students st ON st.id = sub.siswa_id
            JOIN users u ON u.id = st.user_id
            LEFT JOIN subjects s ON s.id = a.subject_id
            LEFT JOIN classes c ON c.id = a.kelas_id
            LEFT JOIN users gu ON gu.id = a.guru_id
        `;

        if (req.user.role === "guru") {
            conditions.push("a.guru_id = ?");
            params.push(req.user.id);
        } else if (req.user.role === "wali_kelas") {
            conditions.push("c.wali_kelas_id = ?");
            params.push(req.user.id);
        } else if (req.user.role === "siswa") {
            conditions.push("st.user_id = ?");
            params.push(req.user.id);
        }

        if (req.query.assignment_id) {
            conditions.push("a.id = ?");
            params.push(Number(req.query.assignment_id));
        }

        if (req.query.kelas_id) {
            conditions.push("a.kelas_id = ?");
            params.push(Number(req.query.kelas_id));
        }

        if (req.query.student_id) {
            conditions.push("st.id = ?");
            params.push(Number(req.query.student_id));
        }

        if (req.query.search) {
            const keyword = `%${String(req.query.search).trim()}%`;

            conditions.push("(u.nama LIKE ? OR a.judul LIKE ? OR st.nis LIKE ?)");
            params.push(keyword, keyword, keyword);
        }

        if (conditions.length) {
            sql += " WHERE " + conditions.join(" AND ");
        }

        sql += " ORDER BY g.created_at DESC, g.id DESC";

        const grades = db.prepare(sql).all(...params);

        res.json({
            status: "success",
            grades
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal mengambil data nilai"
        });
    }
});

// Memberi atau memperbarui nilai
router.post("/", allowRoles("admin", "guru"), (req, res) => {
    try {
        const { submission_id, nilai, komentar } = req.body;

        if (!submission_id || nilai === undefined || nilai === null || nilai === "") {
            return res.status(400).json({
                status: "error",
                message: "Pengumpulan tugas dan nilai wajib diisi"
            });
        }

        const nilaiNumber = Number(nilai);

        if (!Number.isFinite(nilaiNumber) || nilaiNumber < 0 || nilaiNumber > 100) {
            return res.status(400).json({
                status: "error",
                message: "Nilai harus berupa angka 0 sampai 100"
            });
        }

        const submission = db.prepare(`
            SELECT sub.id, a.guru_id
            FROM submissions sub
            JOIN assignments a ON a.id = sub.tugas_id
            WHERE sub.id = ?
        `).get(Number(submission_id));

        if (!submission) {
            return res.status(404).json({
                status: "error",
                message: "Pengumpulan tugas tidak ditemukan"
            });
        }

        if (req.user.role === "guru" && submission.guru_id !== req.user.id) {
            return res.status(403).json({
                status: "error",
                message: "Kamu hanya bisa menilai tugas milik sendiri"
            });
        }

        const result = db.prepare(`
            INSERT INTO grades (submission_id, nilai, komentar)
            VALUES (?, ?, ?)
            ON CONFLICT(submission_id) DO UPDATE SET
                nilai = excluded.nilai,
                komentar = excluded.komentar
        `).run(
            submission.id,
            nilaiNumber,
            komentar ? String(komentar).trim() : null
        );

        const grade = db.prepare(
            "SELECT id FROM grades WHERE submission_id = ?"
        ).get(submission.id);

        res.status(201).json({
            status: "success",
            message: "Nilai berhasil disimpan",
            grade: grade ? getGrade(grade.id) : null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menyimpan nilai"
        });
    }
});

// Mengubah nilai
router.put("/:id", allowRoles("admin", "guru"), (req, res) => {
    try {
        const id = Number(req.params.id);
        const { nilai, komentar } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID nilai tidak valid"
            });
        }

        const grade = db.prepare(`
            SELECT g.id, a.guru_id
            FROM grades g
            JOIN submissions sub ON sub.id = g.submission_id
            JOIN assignments a ON a.id = sub.tugas_id
            WHERE g.id = ?
        `).get(id);

        if (!grade) {
            return res.status(404).json({
                status: "error",
                message: "Nilai tidak ditemukan"
            });
        }

        if (req.user.role === "guru" && grade.guru_id !== req.user.id) {
            return res.status(403).json({
                status: "error",
                message: "Kamu hanya bisa mengubah nilai pada tugas milik sendiri"
            });
        }

        const nilaiNumber = Number(nilai);

        if (!Number.isFinite(nilaiNumber) || nilaiNumber < 0 || nilaiNumber > 100) {
            return res.status(400).json({
                status: "error",
                message: "Nilai harus berupa angka 0 sampai 100"
            });
        }

        db.prepare(`
            UPDATE grades
            SET nilai = ?, komentar = ?
            WHERE id = ?
        `).run(
            nilaiNumber,
            komentar ? String(komentar).trim() : null,
            id
        );

        res.json({
            status: "success",
            message: "Nilai berhasil diperbarui",
            grade: getGrade(id)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal memperbarui nilai"
        });
    }
});

// Menghapus nilai
router.delete("/:id", allowRoles("admin", "guru"), (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID nilai tidak valid"
            });
        }

        const grade = db.prepare(`
            SELECT g.id, a.guru_id
            FROM grades g
            JOIN submissions sub ON sub.id = g.submission_id
            JOIN assignments a ON a.id = sub.tugas_id
            WHERE g.id = ?
        `).get(id);

        if (!grade) {
            return res.status(404).json({
                status: "error",
                message: "Nilai tidak ditemukan"
            });
        }

        if (req.user.role === "guru" && grade.guru_id !== req.user.id) {
            return res.status(403).json({
                status: "error",
                message: "Kamu hanya bisa menghapus nilai pada tugas milik sendiri"
            });
        }

        db.prepare("DELETE FROM grades WHERE id = ?").run(id);

        res.json({
            status: "success",
            message: "Nilai berhasil dihapus"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menghapus nilai"
        });
    }
});

module.exports = router;
