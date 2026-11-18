const express = require("express");
const db = require("../config/database");
const { auth, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.use(auth);

// Menampilkan data guru
router.get("/", (req, res) => {
    try {
        const conditions = [];
        const params = [];

        let sql = `
            SELECT
                t.id, t.user_id, t.nip,
                u.nama, u.username, u.role, u.status,
                (
                    SELECT GROUP_CONCAT(c.nama_kelas, ', ')
                    FROM classes c
                    WHERE c.wali_kelas_id = u.id
                ) AS kelas_wali
            FROM teachers t
            JOIN users u ON u.id = t.user_id
        `;

        if (req.query.search) {
            const keyword = `%${String(req.query.search).trim()}%`;

            conditions.push("(u.nama LIKE ? OR t.nip LIKE ? OR u.username LIKE ?)");
            params.push(keyword, keyword, keyword);
        }

        if (conditions.length) {
            sql += " WHERE " + conditions.join(" AND ");
        }

        sql += " ORDER BY u.nama COLLATE NOCASE";

        const teachers = db.prepare(sql).all(...params);

        res.json({
            status: "success",
            teachers
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal mengambil data guru"
        });
    }
});

// Menambahkan data guru
router.post("/", allowRoles("admin"), (req, res) => {
    try {
        const { user_id, nip } = req.body;

        if (!user_id || !nip) {
            return res.status(400).json({
                status: "error",
                message: "Akun guru dan NIP wajib diisi"
            });
        }

        const userId = Number(user_id);

        const user = db.prepare(
            "SELECT id FROM users WHERE id = ? AND role IN ('guru', 'wali_kelas')"
        ).get(userId);

        if (!user) {
            return res.status(400).json({
                status: "error",
                message: "Akun guru tidak valid"
            });
        }

        const existingTeacher = db.prepare(
            "SELECT id FROM teachers WHERE user_id = ?"
        ).get(userId);

        if (existingTeacher) {
            return res.status(409).json({
                status: "error",
                message: "Akun tersebut sudah terhubung dengan data guru"
            });
        }

        const result = db.prepare(`
            INSERT INTO teachers (user_id, nip)
            VALUES (?, ?)
        `).run(userId, String(nip).trim());

        res.status(201).json({
            status: "success",
            message: "Data guru berhasil ditambahkan",
            id: result.lastInsertRowid
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                status: "error",
                message: "NIP atau akun guru sudah digunakan"
            });
        }

        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menambahkan data guru"
        });
    }
});

// Mengubah data guru
router.put("/:id", allowRoles("admin"), (req, res) => {
    try {
        const id = Number(req.params.id);
        const { user_id, nip } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID guru tidak valid"
            });
        }

        if (!user_id || !nip) {
            return res.status(400).json({
                status: "error",
                message: "Akun guru dan NIP wajib diisi"
            });
        }

        const existing = db.prepare(
            "SELECT id FROM teachers WHERE id = ?"
        ).get(id);

        if (!existing) {
            return res.status(404).json({
                status: "error",
                message: "Data guru tidak ditemukan"
            });
        }

        const userId = Number(user_id);

        const user = db.prepare(
            "SELECT id FROM users WHERE id = ? AND role IN ('guru', 'wali_kelas')"
        ).get(userId);

        if (!user) {
            return res.status(400).json({
                status: "error",
                message: "Akun guru tidak valid"
            });
        }

        const linkedTeacher = db.prepare(
            "SELECT id FROM teachers WHERE user_id = ? AND id <> ?"
        ).get(userId, id);

        if (linkedTeacher) {
            return res.status(409).json({
                status: "error",
                message: "Akun tersebut sudah terhubung dengan data guru lain"
            });
        }

        db.prepare(`
            UPDATE teachers
            SET user_id = ?, nip = ?
            WHERE id = ?
        `).run(userId, String(nip).trim(), id);

        res.json({
            status: "success",
            message: "Data guru berhasil diperbarui"
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                status: "error",
                message: "NIP atau akun guru sudah digunakan"
            });
        }

        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal memperbarui data guru"
        });
    }
});

// Menghapus data guru
router.delete("/:id", allowRoles("admin"), (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID guru tidak valid"
            });
        }

        const existing = db.prepare(
            "SELECT id FROM teachers WHERE id = ?"
        ).get(id);

        if (!existing) {
            return res.status(404).json({
                status: "error",
                message: "Data guru tidak ditemukan"
            });
        }

        db.prepare("DELETE FROM teachers WHERE id = ?").run(id);

        res.json({
            status: "success",
            message: "Data guru berhasil dihapus"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menghapus data guru"
        });
    }
});

module.exports = router;
