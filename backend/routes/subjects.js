const express = require("express");
const db = require("../config/database");
const { auth, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.use(auth);

// Menampilkan mata pelajaran
router.get("/", (req, res) => {
    try {
        const subjects = db.prepare(`
            SELECT
                s.id, s.nama_mapel,
                (SELECT COUNT(*) FROM assignments a WHERE a.subject_id = s.id) AS jumlah_tugas
            FROM subjects s
            ORDER BY s.nama_mapel COLLATE NOCASE
        `).all();

        res.json({
            status: "success",
            subjects
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal mengambil data mata pelajaran"
        });
    }
});

// Menambahkan mata pelajaran
router.post("/", allowRoles("admin"), (req, res) => {
    try {
        const { nama_mapel } = req.body;

        if (!nama_mapel || !String(nama_mapel).trim()) {
            return res.status(400).json({
                status: "error",
                message: "Nama mata pelajaran wajib diisi"
            });
        }

        const nama = String(nama_mapel).trim();

        const duplicate = db.prepare(
            "SELECT id FROM subjects WHERE LOWER(nama_mapel) = LOWER(?)"
        ).get(nama);

        if (duplicate) {
            return res.status(409).json({
                status: "error",
                message: "Mata pelajaran sudah ada"
            });
        }

        const result = db.prepare(
            "INSERT INTO subjects (nama_mapel) VALUES (?)"
        ).run(nama);

        res.status(201).json({
            status: "success",
            message: "Mata pelajaran berhasil ditambahkan",
            id: result.lastInsertRowid
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menambahkan mata pelajaran"
        });
    }
});

// Mengubah mata pelajaran
router.put("/:id", allowRoles("admin"), (req, res) => {
    try {
        const id = Number(req.params.id);
        const { nama_mapel } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID mata pelajaran tidak valid"
            });
        }

        if (!nama_mapel || !String(nama_mapel).trim()) {
            return res.status(400).json({
                status: "error",
                message: "Nama mata pelajaran wajib diisi"
            });
        }

        const existing = db.prepare(
            "SELECT id FROM subjects WHERE id = ?"
        ).get(id);

        if (!existing) {
            return res.status(404).json({
                status: "error",
                message: "Mata pelajaran tidak ditemukan"
            });
        }

        const nama = String(nama_mapel).trim();

        const duplicate = db.prepare(
            "SELECT id FROM subjects WHERE LOWER(nama_mapel) = LOWER(?) AND id <> ?"
        ).get(nama, id);

        if (duplicate) {
            return res.status(409).json({
                status: "error",
                message: "Mata pelajaran sudah ada"
            });
        }

        db.prepare(
            "UPDATE subjects SET nama_mapel = ? WHERE id = ?"
        ).run(nama, id);

        res.json({
            status: "success",
            message: "Mata pelajaran berhasil diperbarui"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal memperbarui mata pelajaran"
        });
    }
});

// Menghapus mata pelajaran
router.delete("/:id", allowRoles("admin"), (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID mata pelajaran tidak valid"
            });
        }

        const existing = db.prepare(
            "SELECT id FROM subjects WHERE id = ?"
        ).get(id);

        if (!existing) {
            return res.status(404).json({
                status: "error",
                message: "Mata pelajaran tidak ditemukan"
            });
        }

        const totalAssignments = db.prepare(
            "SELECT COUNT(*) AS total FROM assignments WHERE subject_id = ?"
        ).get(id).total;

        if (totalAssignments > 0) {
            return res.status(409).json({
                status: "error",
                message: "Mata pelajaran masih digunakan oleh tugas"
            });
        }

        db.prepare("DELETE FROM subjects WHERE id = ?").run(id);

        res.json({
            status: "success",
            message: "Mata pelajaran berhasil dihapus"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menghapus mata pelajaran"
        });
    }
});

module.exports = router;
