const express = require("express");
const db = require("../config/database");
const { auth, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.use(auth);

// Kolom tambahan: jenis kelamin (L/P) dan nomor kamar
function bacaTambahan(body) {
    const jk = body.jenis_kelamin ? String(body.jenis_kelamin).trim().toUpperCase() : null;

    if (jk && !["L", "P"].includes(jk)) {
        return { error: "Jenis kelamin harus L atau P" };
    }

    const kamar = body.no_kamar ? String(body.no_kamar).trim().slice(0, 20) : null;

    return { jenis_kelamin: jk, no_kamar: kamar || null };
}

// Menampilkan data siswa
router.get("/", (req, res) => {
    try {
        const conditions = [];
        const params = [];

        let sql = `
            SELECT
                st.id, st.user_id, st.nis, st.kelas_id, st.alamat,
                st.jenis_kelamin, st.no_kamar, st.barcode,
                u.nama, u.username, u.status,
                (u.foto IS NOT NULL AND u.foto <> '') AS has_photo,
                c.nama_kelas, c.jurusan, c.wali_kelas_id
            FROM students st
            JOIN users u ON u.id = st.user_id
            LEFT JOIN classes c ON c.id = st.kelas_id
        `;

        if (req.user.role === "siswa") {
            conditions.push("st.user_id = ?");
            params.push(req.user.id);
        } else if (req.user.role === "wali_kelas") {
            conditions.push("c.wali_kelas_id = ?");
            params.push(req.user.id);
        }

        if (req.query.kelas_id) {
            conditions.push("st.kelas_id = ?");
            params.push(Number(req.query.kelas_id));
        }

        if (req.query.search) {
            const keyword = `%${String(req.query.search).trim()}%`;

            conditions.push(
                "(u.nama LIKE ? OR st.nis LIKE ? OR c.nama_kelas LIKE ?)"
            );
            params.push(keyword, keyword, keyword);
        }

        if (conditions.length) {
            sql += " WHERE " + conditions.join(" AND ");
        }

        sql += " ORDER BY COALESCE(c.nama_kelas, ''), u.nama COLLATE NOCASE";

        const students = db.prepare(sql).all(...params);

        // Kode barcode hanya untuk admin (cetak kartu) dan siswa itu sendiri
        if (req.user.role === "guru" || req.user.role === "wali_kelas") {
            for (const s of students) delete s.barcode;
        }

        res.json({
            status: "success",
            students
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal mengambil data siswa"
        });
    }
});

// Menambahkan data siswa
router.post("/", allowRoles("admin"), (req, res) => {
    try {
        const { user_id, nis, kelas_id, alamat } = req.body;
        const extra = bacaTambahan(req.body);

        if (extra.error) {
            return res.status(400).json({ status: "error", message: extra.error });
        }

        if (!user_id || !nis || !kelas_id) {
            return res.status(400).json({
                status: "error",
                message: "Akun siswa, NIS, dan kelas wajib diisi"
            });
        }

        const userId = Number(user_id);
        const kelasId = Number(kelas_id);

        const user = db.prepare(
            "SELECT id FROM users WHERE id = ? AND role = 'siswa'"
        ).get(userId);

        if (!user) {
            return res.status(400).json({
                status: "error",
                message: "Akun siswa tidak valid"
            });
        }

        const existingStudent = db.prepare(
            "SELECT id FROM students WHERE user_id = ?"
        ).get(userId);

        if (existingStudent) {
            return res.status(409).json({
                status: "error",
                message: "Akun tersebut sudah terhubung dengan data siswa"
            });
        }

        const kelas = db.prepare(
            "SELECT id FROM classes WHERE id = ?"
        ).get(kelasId);

        if (!kelas) {
            return res.status(400).json({
                status: "error",
                message: "Kelas tidak valid"
            });
        }

        const result = db.prepare(`
            INSERT INTO students (user_id, nis, kelas_id, alamat, jenis_kelamin, no_kamar, barcode)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            userId,
            String(nis).trim(),
            kelasId,
            alamat ? String(alamat).trim() : null,
            extra.jenis_kelamin,
            extra.no_kamar,
            db.buatBarcode()
        );

        res.status(201).json({
            status: "success",
            message: "Data siswa berhasil ditambahkan",
            id: result.lastInsertRowid
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                status: "error",
                message: "NIS atau akun siswa sudah digunakan"
            });
        }

        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menambahkan data siswa"
        });
    }
});

// Mengubah data siswa
router.put("/:id", allowRoles("admin"), (req, res) => {
    try {
        const id = Number(req.params.id);
        const { user_id, nis, kelas_id, alamat } = req.body;
        const extra = bacaTambahan(req.body);

        if (extra.error) {
            return res.status(400).json({ status: "error", message: extra.error });
        }

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID siswa tidak valid"
            });
        }

        if (!user_id || !nis || !kelas_id) {
            return res.status(400).json({
                status: "error",
                message: "Akun siswa, NIS, dan kelas wajib diisi"
            });
        }

        const existing = db.prepare(
            "SELECT id FROM students WHERE id = ?"
        ).get(id);

        if (!existing) {
            return res.status(404).json({
                status: "error",
                message: "Data siswa tidak ditemukan"
            });
        }

        const userId = Number(user_id);
        const kelasId = Number(kelas_id);

        const user = db.prepare(
            "SELECT id FROM users WHERE id = ? AND role = 'siswa'"
        ).get(userId);

        if (!user) {
            return res.status(400).json({
                status: "error",
                message: "Akun siswa tidak valid"
            });
        }

        const linkedStudent = db.prepare(
            "SELECT id FROM students WHERE user_id = ? AND id <> ?"
        ).get(userId, id);

        if (linkedStudent) {
            return res.status(409).json({
                status: "error",
                message: "Akun tersebut sudah terhubung dengan data siswa lain"
            });
        }

        const kelas = db.prepare(
            "SELECT id FROM classes WHERE id = ?"
        ).get(kelasId);

        if (!kelas) {
            return res.status(400).json({
                status: "error",
                message: "Kelas tidak valid"
            });
        }

        db.prepare(`
            UPDATE students
            SET user_id = ?, nis = ?, kelas_id = ?, alamat = ?,
                jenis_kelamin = ?, no_kamar = ?
            WHERE id = ?
        `).run(
            userId,
            String(nis).trim(),
            kelasId,
            alamat ? String(alamat).trim() : null,
            extra.jenis_kelamin,
            extra.no_kamar,
            id
        );

        res.json({
            status: "success",
            message: "Data siswa berhasil diperbarui"
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                status: "error",
                message: "NIS atau akun siswa sudah digunakan"
            });
        }

        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal memperbarui data siswa"
        });
    }
});

// Menghapus data siswa
router.delete("/:id", allowRoles("admin"), (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID siswa tidak valid"
            });
        }

        const existing = db.prepare(
            "SELECT id FROM students WHERE id = ?"
        ).get(id);

        if (!existing) {
            return res.status(404).json({
                status: "error",
                message: "Data siswa tidak ditemukan"
            });
        }

        const removeStudent = db.transaction(() => {
            db.prepare(`
                DELETE FROM grades
                WHERE submission_id IN (
                    SELECT id FROM submissions WHERE siswa_id = ?
                )
            `).run(id);

            db.prepare("DELETE FROM submissions WHERE siswa_id = ?").run(id);
            db.prepare("DELETE FROM students WHERE id = ?").run(id);
        });

        removeStudent();

        res.json({
            status: "success",
            message: "Data siswa berhasil dihapus"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menghapus data siswa"
        });
    }
});

// Buat ulang kode barcode (misalnya kartu hilang) - admin
router.post("/:id/barcode", allowRoles("admin"), (req, res) => {
    const id = Number(req.params.id);
    const siswa = Number.isInteger(id) && db.prepare("SELECT id FROM students WHERE id = ?").get(id);

    if (!siswa) {
        return res.status(404).json({ status: "error", message: "Data siswa tidak ditemukan" });
    }

    const barcode = db.buatBarcode();

    db.prepare("UPDATE students SET barcode = ? WHERE id = ?").run(barcode, id);

    res.json({ status: "success", message: "Barcode baru dibuat. Cetak ulang kartu siswa.", barcode });
});

module.exports = router;
