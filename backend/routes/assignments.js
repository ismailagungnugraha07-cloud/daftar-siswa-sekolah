const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("../config/database");
const { auth, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.use(auth);

function getAssignment(id) {
    return db.prepare(`
        SELECT
            a.id, a.judul, a.deskripsi, a.guru_id, a.kelas_id,
            a.subject_id, a.batas_waktu, a.created_at,
            s.nama_mapel, c.nama_kelas, c.jurusan,
            u.nama AS guru_nama
        FROM assignments a
        LEFT JOIN subjects s ON s.id = a.subject_id
        LEFT JOIN classes c ON c.id = a.kelas_id
        LEFT JOIN users u ON u.id = a.guru_id
        WHERE a.id = ?
    `).get(id);
}

function removeFile(fileUrl) {
    if (!fileUrl) return;

    const filename = path.basename(fileUrl);
    const filePath = path.join(__dirname, "../uploads", filename);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

// Menampilkan tugas sesuai role
router.get("/", (req, res) => {
    try {
        const conditions = [];
        const params = [];

        let sql = `
            SELECT
                a.id, a.judul, a.deskripsi, a.guru_id, a.kelas_id,
                a.subject_id, a.batas_waktu, a.created_at,
                s.nama_mapel, c.nama_kelas, c.jurusan,
                u.nama AS guru_nama,
                (SELECT COUNT(*) FROM students st WHERE st.kelas_id = a.kelas_id) AS jumlah_siswa,
                (SELECT COUNT(*) FROM submissions sub WHERE sub.tugas_id = a.id) AS jumlah_pengumpulan
        `;

        let student = null;

        if (req.user.role === "siswa") {
            student = db.prepare(
                "SELECT id, kelas_id FROM students WHERE user_id = ?"
            ).get(req.user.id);

            if (!student) {
                return res.json({
                    status: "success",
                    assignments: []
                });
            }

            sql += `,
                (SELECT sub.id FROM submissions sub
                    WHERE sub.tugas_id = a.id AND sub.siswa_id = ?) AS submission_id,
                (SELECT sub.status FROM submissions sub
                    WHERE sub.tugas_id = a.id AND sub.siswa_id = ?) AS submission_status,
                (SELECT sub.file_tugas FROM submissions sub
                    WHERE sub.tugas_id = a.id AND sub.siswa_id = ?) AS file_tugas,
                (SELECT g.nilai FROM submissions sub
                    LEFT JOIN grades g ON g.submission_id = sub.id
                    WHERE sub.tugas_id = a.id AND sub.siswa_id = ?) AS nilai
            `;

            params.push(student.id, student.id, student.id, student.id);
        }

        sql += `
            FROM assignments a
            LEFT JOIN subjects s ON s.id = a.subject_id
            LEFT JOIN classes c ON c.id = a.kelas_id
            LEFT JOIN users u ON u.id = a.guru_id
        `;

        if (req.user.role === "guru") {
            conditions.push("a.guru_id = ?");
            params.push(req.user.id);
        } else if (req.user.role === "wali_kelas") {
            conditions.push("c.wali_kelas_id = ?");
            params.push(req.user.id);
        } else if (req.user.role === "siswa") {
            conditions.push("a.kelas_id = ?");
            params.push(student.kelas_id);
        }

        if (req.query.kelas_id) {
            conditions.push("a.kelas_id = ?");
            params.push(Number(req.query.kelas_id));
        }

        if (req.query.subject_id) {
            conditions.push("a.subject_id = ?");
            params.push(Number(req.query.subject_id));
        }

        if (req.query.search) {
            const keyword = `%${String(req.query.search).trim()}%`;

            conditions.push("(a.judul LIKE ? OR s.nama_mapel LIKE ?)");
            params.push(keyword, keyword);
        }

        if (conditions.length) {
            sql += " WHERE " + conditions.join(" AND ");
        }

        sql += " ORDER BY a.created_at DESC, a.id DESC";

        const assignments = db.prepare(sql).all(...params);

        res.json({
            status: "success",
            assignments
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal mengambil data tugas"
        });
    }
});

// Menambahkan tugas
router.post("/", allowRoles("admin", "guru"), (req, res) => {
    try {
        const {
            judul,
            deskripsi,
            kelas_id,
            subject_id,
            batas_waktu,
            guru_id
        } = req.body;

        if (!judul || !kelas_id || !subject_id) {
            return res.status(400).json({
                status: "error",
                message: "Judul, kelas, dan mata pelajaran wajib diisi"
            });
        }

        const kelasId = Number(kelas_id);
        const subjectId = Number(subject_id);

        const kelas = db.prepare(
            "SELECT id FROM classes WHERE id = ?"
        ).get(kelasId);

        if (!kelas) {
            return res.status(400).json({
                status: "error",
                message: "Kelas tidak valid"
            });
        }

        const subject = db.prepare(
            "SELECT id FROM subjects WHERE id = ?"
        ).get(subjectId);

        if (!subject) {
            return res.status(400).json({
                status: "error",
                message: "Mata pelajaran tidak valid"
            });
        }

        let guruId = req.user.id;

        if (req.user.role === "admin") {
            guruId = Number(guru_id);

            const guru = db.prepare(
                "SELECT id FROM users WHERE id = ? AND role IN ('guru', 'wali_kelas')"
            ).get(guruId);

            if (!guru) {
                return res.status(400).json({
                    status: "error",
                    message: "Guru wajib dipilih"
                });
            }
        }

        const deadline = batas_waktu
            ? String(batas_waktu).replace("T", " ").trim()
            : null;

        const result = db.prepare(`
            INSERT INTO assignments
                (judul, deskripsi, guru_id, kelas_id, subject_id, batas_waktu)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            String(judul).trim(),
            deskripsi ? String(deskripsi).trim() : null,
            guruId,
            kelasId,
            subjectId,
            deadline
        );

        res.status(201).json({
            status: "success",
            message: "Tugas berhasil ditambahkan",
            assignment: getAssignment(result.lastInsertRowid)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menambahkan tugas"
        });
    }
});

// Mengubah tugas
router.put("/:id", allowRoles("admin", "guru"), (req, res) => {
    try {
        const id = Number(req.params.id);
        const {
            judul,
            deskripsi,
            kelas_id,
            subject_id,
            batas_waktu,
            guru_id
        } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID tugas tidak valid"
            });
        }

        const existing = db.prepare(
            "SELECT id, guru_id FROM assignments WHERE id = ?"
        ).get(id);

        if (!existing) {
            return res.status(404).json({
                status: "error",
                message: "Tugas tidak ditemukan"
            });
        }

        if (req.user.role === "guru" && existing.guru_id !== req.user.id) {
            return res.status(403).json({
                status: "error",
                message: "Kamu hanya bisa mengubah tugas milik sendiri"
            });
        }

        if (!judul || !kelas_id || !subject_id) {
            return res.status(400).json({
                status: "error",
                message: "Judul, kelas, dan mata pelajaran wajib diisi"
            });
        }

        const kelasId = Number(kelas_id);
        const subjectId = Number(subject_id);

        const kelas = db.prepare(
            "SELECT id FROM classes WHERE id = ?"
        ).get(kelasId);

        if (!kelas) {
            return res.status(400).json({
                status: "error",
                message: "Kelas tidak valid"
            });
        }

        const subject = db.prepare(
            "SELECT id FROM subjects WHERE id = ?"
        ).get(subjectId);

        if (!subject) {
            return res.status(400).json({
                status: "error",
                message: "Mata pelajaran tidak valid"
            });
        }

        let guruId = existing.guru_id;

        if (req.user.role === "admin") {
            guruId = Number(guru_id) || existing.guru_id;

            const guru = db.prepare(
                "SELECT id FROM users WHERE id = ? AND role IN ('guru', 'wali_kelas')"
            ).get(guruId);

            if (!guru) {
                return res.status(400).json({
                    status: "error",
                    message: "Guru tidak valid"
                });
            }
        }

        const deadline = batas_waktu
            ? String(batas_waktu).replace("T", " ").trim()
            : null;

        db.prepare(`
            UPDATE assignments
            SET judul = ?, deskripsi = ?, guru_id = ?,
                kelas_id = ?, subject_id = ?, batas_waktu = ?
            WHERE id = ?
        `).run(
            String(judul).trim(),
            deskripsi ? String(deskripsi).trim() : null,
            guruId,
            kelasId,
            subjectId,
            deadline,
            id
        );

        res.json({
            status: "success",
            message: "Tugas berhasil diperbarui",
            assignment: getAssignment(id)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal memperbarui tugas"
        });
    }
});

// Menghapus tugas
router.delete("/:id", allowRoles("admin", "guru"), (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID tugas tidak valid"
            });
        }

        const existing = db.prepare(
            "SELECT id, guru_id FROM assignments WHERE id = ?"
        ).get(id);

        if (!existing) {
            return res.status(404).json({
                status: "error",
                message: "Tugas tidak ditemukan"
            });
        }

        if (req.user.role === "guru" && existing.guru_id !== req.user.id) {
            return res.status(403).json({
                status: "error",
                message: "Kamu hanya bisa menghapus tugas milik sendiri"
            });
        }

        const files = db.prepare(
            "SELECT file_tugas FROM submissions WHERE tugas_id = ?"
        ).all(id);

        const removeAssignment = db.transaction(() => {
            db.prepare(`
                DELETE FROM grades
                WHERE submission_id IN (
                    SELECT id FROM submissions WHERE tugas_id = ?
                )
            `).run(id);

            db.prepare("DELETE FROM submissions WHERE tugas_id = ?").run(id);
            db.prepare("DELETE FROM assignments WHERE id = ?").run(id);
        });

        removeAssignment();

        files.forEach((file) => removeFile(file.file_tugas));

        res.json({
            status: "success",
            message: "Tugas berhasil dihapus"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menghapus tugas"
        });
    }
});

module.exports = router;
