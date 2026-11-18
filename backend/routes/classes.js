const express = require("express");
const db = require("../config/database");
const { auth, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.use(auth);

function getClassById(id) {
    return db.prepare(`
        SELECT
            c.id, c.nama_kelas, c.jurusan, c.wali_kelas_id,
            u.nama AS wali_kelas_nama,
            (SELECT COUNT(*) FROM students s WHERE s.kelas_id = c.id) AS jumlah_siswa
        FROM classes c
        LEFT JOIN users u ON u.id = c.wali_kelas_id
        WHERE c.id = ?
    `).get(id);
}

// Menampilkan semua kelas
router.get("/", (req, res) => {
    try {
        const classes = db.prepare(`
            SELECT
                c.id, c.nama_kelas, c.jurusan, c.wali_kelas_id,
                u.nama AS wali_kelas_nama,
                (SELECT COUNT(*) FROM students s WHERE s.kelas_id = c.id) AS jumlah_siswa
            FROM classes c
            LEFT JOIN users u ON u.id = c.wali_kelas_id
            ORDER BY c.nama_kelas COLLATE NOCASE
        `).all();

        res.json({
            status: "success",
            classes
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal mengambil data kelas"
        });
    }
});

// Menambahkan kelas
router.post("/", allowRoles("admin"), (req, res) => {
    try {
        const { nama_kelas, jurusan, wali_kelas_id } = req.body;

        if (!nama_kelas || !String(nama_kelas).trim()) {
            return res.status(400).json({
                status: "error",
                message: "Nama kelas wajib diisi"
            });
        }

        let waliId = null;

        if (wali_kelas_id) {
            waliId = Number(wali_kelas_id);

            const wali = db.prepare(
                "SELECT id FROM users WHERE id = ? AND role IN ('wali_kelas', 'guru')"
            ).get(waliId);

            if (!wali) {
                return res.status(400).json({
                    status: "error",
                    message: "Wali kelas tidak valid"
                });
            }
        }

        const result = db.prepare(`
            INSERT INTO classes (nama_kelas, jurusan, wali_kelas_id)
            VALUES (?, ?, ?)
        `).run(
            String(nama_kelas).trim(),
            jurusan ? String(jurusan).trim() : null,
            waliId
        );

        res.status(201).json({
            status: "success",
            message: "Kelas berhasil ditambahkan",
            class: getClassById(result.lastInsertRowid)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menambahkan kelas"
        });
    }
});

// Mengubah kelas
router.put("/:id", allowRoles("admin"), (req, res) => {
    try {
        const id = Number(req.params.id);
        const { nama_kelas, jurusan, wali_kelas_id } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID kelas tidak valid"
            });
        }

        if (!nama_kelas || !String(nama_kelas).trim()) {
            return res.status(400).json({
                status: "error",
                message: "Nama kelas wajib diisi"
            });
        }

        const existing = db.prepare(
            "SELECT id FROM classes WHERE id = ?"
        ).get(id);

        if (!existing) {
            return res.status(404).json({
                status: "error",
                message: "Kelas tidak ditemukan"
            });
        }

        let waliId = null;

        if (wali_kelas_id) {
            waliId = Number(wali_kelas_id);

            const wali = db.prepare(
                "SELECT id FROM users WHERE id = ? AND role IN ('wali_kelas', 'guru')"
            ).get(waliId);

            if (!wali) {
                return res.status(400).json({
                    status: "error",
                    message: "Wali kelas tidak valid"
                });
            }
        }

        db.prepare(`
            UPDATE classes
            SET nama_kelas = ?, jurusan = ?, wali_kelas_id = ?
            WHERE id = ?
        `).run(
            String(nama_kelas).trim(),
            jurusan ? String(jurusan).trim() : null,
            waliId,
            id
        );

        res.json({
            status: "success",
            message: "Data kelas berhasil diperbarui",
            class: getClassById(id)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal memperbarui kelas"
        });
    }
});

// Menghapus kelas
router.delete("/:id", allowRoles("admin"), (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID kelas tidak valid"
            });
        }

        const existing = db.prepare(
            "SELECT id FROM classes WHERE id = ?"
        ).get(id);

        if (!existing) {
            return res.status(404).json({
                status: "error",
                message: "Kelas tidak ditemukan"
            });
        }

        const totalStudents = db.prepare(
            "SELECT COUNT(*) AS total FROM students WHERE kelas_id = ?"
        ).get(id).total;

        if (totalStudents > 0) {
            return res.status(409).json({
                status: "error",
                message: "Kelas masih memiliki siswa. Pindahkan siswa terlebih dahulu."
            });
        }

        const totalAssignments = db.prepare(
            "SELECT COUNT(*) AS total FROM assignments WHERE kelas_id = ?"
        ).get(id).total;

        if (totalAssignments > 0) {
            return res.status(409).json({
                status: "error",
                message: "Kelas masih memiliki tugas. Hapus tugas terlebih dahulu."
            });
        }

        db.prepare("DELETE FROM classes WHERE id = ?").run(id);

        res.json({
            status: "success",
            message: "Kelas berhasil dihapus"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menghapus kelas"
        });
    }
});

module.exports = router;
