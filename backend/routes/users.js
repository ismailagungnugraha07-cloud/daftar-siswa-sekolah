const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../config/database");
const { auth, allowRoles } = require("../middleware/auth");

const router = express.Router();

const allowedRoles = ["admin", "guru", "wali_kelas", "siswa"];
const allowedStatuses = ["aktif", "nonaktif"];

// Semua route di bawah hanya bisa diakses admin
router.use(auth, allowRoles("admin"));

// 1. Menampilkan semua pengguna (bisa dicari dan difilter)
router.get("/", (req, res) => {
    try {
        const conditions = [];
        const params = [];

        const sql = `
            SELECT
                u.id, u.nama, u.username, u.role, u.status, u.created_at,
                s.id AS student_id,
                t.id AS teacher_id
            FROM users u
            LEFT JOIN students s ON s.user_id = u.id
            LEFT JOIN teachers t ON t.user_id = u.id
        `;

        if (req.query.role) {
            conditions.push("u.role = ?");
            params.push(String(req.query.role));
        }

        if (req.query.unlinked === "1") {
            conditions.push("s.id IS NULL", "t.id IS NULL");
        }

        if (req.query.search) {
            const keyword = `%${String(req.query.search).trim()}%`;

            conditions.push(
                "(u.nama LIKE ? OR u.username LIKE ? OR u.role LIKE ?)"
            );
            params.push(keyword, keyword, keyword);
        }

        const where = conditions.length
            ? " WHERE " + conditions.join(" AND ")
            : "";

        const users = db.prepare(
            sql + where + " ORDER BY u.id DESC"
        ).all(...params);

        res.json({
            status: "success",
            users
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal mengambil data pengguna"
        });
    }
});

// 2. Detail satu pengguna
router.get("/:id", (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID pengguna tidak valid"
            });
        }

        const user = db.prepare(`
            SELECT id, nama, username, role, status, created_at
            FROM users
            WHERE id = ?
        `).get(id);

        if (!user) {
            return res.status(404).json({
                status: "error",
                message: "Pengguna tidak ditemukan"
            });
        }

        res.json({
            status: "success",
            user
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal mengambil data pengguna"
        });
    }
});

// 3. Menambahkan pengguna
router.post("/", (req, res) => {
    try {
        const { nama, username, password, role } = req.body;

        if (!nama || !username || !password || !role) {
            return res.status(400).json({
                status: "error",
                message: "Nama, username, password, dan role wajib diisi"
            });
        }

        if (!allowedRoles.includes(role)) {
            return res.status(400).json({
                status: "error",
                message: "Role tidak valid"
            });
        }

        if (String(password).length < 6) {
            return res.status(400).json({
                status: "error",
                message: "Password minimal 6 karakter"
            });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);

        const result = db.prepare(`
            INSERT INTO users (nama, username, password, role, status)
            VALUES (?, ?, ?, ?, 'aktif')
        `).run(
            String(nama).trim(),
            String(username).trim(),
            hashedPassword,
            role
        );

        res.status(201).json({
            status: "success",
            message: "Pengguna berhasil ditambahkan",
            id: result.lastInsertRowid
        });

    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                status: "error",
                message: "Username sudah digunakan"
            });
        }

        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menambahkan pengguna"
        });
    }
});

// 3. Mengubah data pengguna
router.put("/:id", (req, res) => {
    try {
        const id = Number(req.params.id);
        const { nama, username, role, status, password } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID pengguna tidak valid"
            });
        }

        if (!nama || !username || !role || !status) {
            return res.status(400).json({
                status: "error",
                message: "Nama, username, role, dan status wajib diisi"
            });
        }

        if (!allowedRoles.includes(role)) {
            return res.status(400).json({
                status: "error",
                message: "Role tidak valid"
            });
        }

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                status: "error",
                message: "Status tidak valid"
            });
        }

        const existingUser = db.prepare(
            "SELECT id, role FROM users WHERE id = ?"
        ).get(id);

        if (!existingUser) {
            return res.status(404).json({
                status: "error",
                message: "Pengguna tidak ditemukan"
            });
        }

        if (id === Number(req.user.id) && (role !== "admin" || status !== "aktif")) {
            return res.status(400).json({
                status: "error",
                message: "Kamu tidak bisa menurunkan role atau menonaktifkan akun sendiri"
            });
        }

        if (existingUser.role === "admin" && role !== "admin") {
            const totalAdmins = db.prepare(
                "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'"
            ).get().total;

            if (totalAdmins <= 1) {
                return res.status(400).json({
                    status: "error",
                    message: "Minimal harus ada satu akun admin"
                });
            }
        }

        if (password && String(password).length < 6) {
            return res.status(400).json({
                status: "error",
                message: "Password baru minimal 6 karakter"
            });
        }

        if (password) {
            const hashedPassword = bcrypt.hashSync(password, 10);

            db.prepare(`
                UPDATE users
                SET nama = ?, username = ?, role = ?, status = ?, password = ?
                WHERE id = ?
            `).run(
                String(nama).trim(),
                String(username).trim(),
                role,
                status,
                hashedPassword,
                id
            );
        } else {
            db.prepare(`
                UPDATE users
                SET nama = ?, username = ?, role = ?, status = ?
                WHERE id = ?
            `).run(
                String(nama).trim(),
                String(username).trim(),
                role,
                status,
                id
            );
        }

        res.json({
            status: "success",
            message: "Data pengguna berhasil diperbarui"
        });

    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                status: "error",
                message: "Username sudah digunakan"
            });
        }

        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal memperbarui pengguna"
        });
    }
});

// 4. Menghapus pengguna
router.delete("/:id", (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID pengguna tidak valid"
            });
        }

        if (id === Number(req.user.id)) {
            return res.status(400).json({
                status: "error",
                message: "Kamu tidak bisa menghapus akun sendiri"
            });
        }

        const existingUser = db.prepare(
            "SELECT id, role FROM users WHERE id = ?"
        ).get(id);

        if (!existingUser) {
            return res.status(404).json({
                status: "error",
                message: "Pengguna tidak ditemukan"
            });
        }

        if (existingUser.role === "admin") {
            const totalAdmins = db.prepare(
                "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'"
            ).get().total;

            if (totalAdmins <= 1) {
                return res.status(400).json({
                    status: "error",
                    message: "Minimal harus ada satu akun admin"
                });
            }
        }

        const deleteUser = db.transaction(() => {
            db.prepare(
                "UPDATE classes SET wali_kelas_id = NULL WHERE wali_kelas_id = ?"
            ).run(id);
            db.prepare("DELETE FROM students WHERE user_id = ?").run(id);
            db.prepare("DELETE FROM teachers WHERE user_id = ?").run(id);
            db.prepare("DELETE FROM users WHERE id = ?").run(id);
        });

        deleteUser();

        res.json({
            status: "success",
            message: "Pengguna berhasil dihapus"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menghapus pengguna"
        });
    }
});

module.exports = router;