const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const db = require("../config/database");
const { auth, allowRoles } = require("../middleware/auth");

const router = express.Router();

const uploadDir = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedExtensions = new Set([
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".zip", ".rar", ".jpg", ".jpeg", ".png", ".webp"
]);

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, uploadDir);
    },
    filename: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const filename = Date.now() + "-" +
            crypto.randomBytes(6).toString("hex") + extension;

        callback(null, filename);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();

        if (!allowedExtensions.has(extension)) {
            return callback(new Error(
                "Tipe file tidak didukung. Gunakan PDF, DOC, XLS, PPT, TXT, ZIP, atau gambar."
            ));
        }

        callback(null, true);
    }
});

router.use(auth);

function removeFile(fileUrl) {
    if (!fileUrl) return;

    const filename = path.basename(fileUrl);
    const filePath = path.join(uploadDir, filename);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

function getSubmissionStatus(deadline) {
    if (!deadline) return "terkirim";

    const deadlineDate = new Date(String(deadline).replace(" ", "T"));

    if (Number.isNaN(deadlineDate.getTime())) {
        return "terkirim";
    }

    return Date.now() > deadlineDate.getTime()
        ? "terlambat"
        : "terkirim";
}

// Menampilkan pengumpulan tugas
router.get("/", (req, res) => {
    try {
        if (req.query.assignment_id && req.user.role !== "siswa") {
            const assignmentId = Number(req.query.assignment_id);

            if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
                return res.status(400).json({
                    status: "error",
                    message: "ID tugas tidak valid"
                });
            }

            const assignment = db.prepare(`
                SELECT
                    a.id, a.judul, a.kelas_id, a.guru_id, a.subject_id,
                    a.batas_waktu, a.created_at,
                    c.nama_kelas, c.jurusan, c.wali_kelas_id,
                    s.nama_mapel, u.nama AS guru_nama
                FROM assignments a
                LEFT JOIN classes c ON c.id = a.kelas_id
                LEFT JOIN subjects s ON s.id = a.subject_id
                LEFT JOIN users u ON u.id = a.guru_id
                WHERE a.id = ?
            `).get(assignmentId);

            if (!assignment) {
                return res.status(404).json({
                    status: "error",
                    message: "Tugas tidak ditemukan"
                });
            }

            if (req.user.role === "guru" && assignment.guru_id !== req.user.id) {
                return res.status(403).json({
                    status: "error",
                    message: "Kamu hanya bisa melihat pengumpulan tugas milik sendiri"
                });
            }

            if (req.user.role === "wali_kelas" &&
                assignment.wali_kelas_id !== req.user.id) {
                return res.status(403).json({
                    status: "error",
                    message: "Kamu hanya bisa melihat tugas kelas yang kamu ampu"
                });
            }

            const students = db.prepare(`
                SELECT
                    st.id AS student_id,
                    st.nis,
                    u.nama,
                    sub.id AS submission_id,
                    sub.isi_tugas,
                    sub.file_tugas,
                    sub.status,
                    sub.created_at,
                    g.id AS grade_id,
                    g.nilai,
                    g.komentar
                FROM students st
                JOIN users u ON u.id = st.user_id
                LEFT JOIN submissions sub
                    ON sub.tugas_id = ? AND sub.siswa_id = st.id
                LEFT JOIN grades g ON g.submission_id = sub.id
                WHERE st.kelas_id = ?
                ORDER BY u.nama COLLATE NOCASE
            `).all(assignmentId, assignment.kelas_id);

            const submitted = students.filter((item) => item.submission_id).length;
            const graded = students.filter((item) => item.grade_id).length;

            return res.json({
                status: "success",
                assignment,
                students,
                statistics: {
                    totalStudents: students.length,
                    submitted,
                    notSubmitted: students.length - submitted,
                    graded
                }
            });
        }

        if (req.user.role === "siswa" || req.query.mine === "1") {
            const student = db.prepare(
                "SELECT id FROM students WHERE user_id = ?"
            ).get(req.user.id);

            if (!student) {
                return res.json({
                    status: "success",
                    submissions: []
                });
            }

            const submissions = db.prepare(`
                SELECT
                    sub.id, sub.tugas_id, sub.isi_tugas, sub.file_tugas,
                    sub.status, sub.created_at,
                    a.judul, a.batas_waktu,
                    s.nama_mapel, c.nama_kelas,
                    g.nilai, g.komentar
                FROM submissions sub
                JOIN assignments a ON a.id = sub.tugas_id
                LEFT JOIN subjects s ON s.id = a.subject_id
                LEFT JOIN classes c ON c.id = a.kelas_id
                LEFT JOIN grades g ON g.submission_id = sub.id
                WHERE sub.siswa_id = ?
                ORDER BY sub.created_at DESC
            `).all(student.id);

            return res.json({
                status: "success",
                submissions
            });
        }

        const conditions = [];
        const params = [];

        let sql = `
            SELECT
                sub.id, sub.tugas_id, sub.siswa_id,
                sub.isi_tugas, sub.file_tugas, sub.status, sub.created_at,
                a.judul, a.kelas_id, a.guru_id, a.batas_waktu,
                s.nama_mapel, c.nama_kelas,
                st.nis, u.nama AS siswa_nama,
                g.id AS grade_id, g.nilai, g.komentar
            FROM submissions sub
            JOIN assignments a ON a.id = sub.tugas_id
            JOIN students st ON st.id = sub.siswa_id
            JOIN users u ON u.id = st.user_id
            LEFT JOIN subjects s ON s.id = a.subject_id
            LEFT JOIN classes c ON c.id = a.kelas_id
            LEFT JOIN grades g ON g.submission_id = sub.id
        `;

        if (req.user.role === "guru") {
            conditions.push("a.guru_id = ?");
            params.push(req.user.id);
        } else if (req.user.role === "wali_kelas") {
            conditions.push("c.wali_kelas_id = ?");
            params.push(req.user.id);
        }

        if (req.query.assignment_id) {
            conditions.push("sub.tugas_id = ?");
            params.push(Number(req.query.assignment_id));
        }

        if (req.query.kelas_id) {
            conditions.push("a.kelas_id = ?");
            params.push(Number(req.query.kelas_id));
        }

        if (req.query.search) {
            const keyword = `%${String(req.query.search).trim()}%`;

            conditions.push("(u.nama LIKE ? OR st.nis LIKE ? OR a.judul LIKE ?)");
            params.push(keyword, keyword, keyword);
        }

        if (conditions.length) {
            sql += " WHERE " + conditions.join(" AND ");
        }

        sql += " ORDER BY sub.created_at DESC, sub.id DESC";

        const submissions = db.prepare(sql).all(...params);

        res.json({
            status: "success",
            submissions
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal mengambil data pengumpulan tugas"
        });
    }
});

// Mengumpulkan tugas (siswa)
router.post("/", allowRoles("siswa"), upload.single("file"), (req, res) => {
    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const { tugas_id, isi_tugas } = req.body;

        if (!tugas_id) {
            removeFile(fileUrl);

            return res.status(400).json({
                status: "error",
                message: "Tugas wajib dipilih"
            });
        }

        if (!isi_tugas && !fileUrl) {
            return res.status(400).json({
                status: "error",
                message: "Isi tugas atau file wajib diisi"
            });
        }

        const student = db.prepare(
            "SELECT id, kelas_id FROM students WHERE user_id = ?"
        ).get(req.user.id);

        if (!student) {
            removeFile(fileUrl);

            return res.status(400).json({
                status: "error",
                message: "Data siswa belum tersedia"
            });
        }

        const assignment = db.prepare(
            "SELECT id, kelas_id, batas_waktu FROM assignments WHERE id = ?"
        ).get(Number(tugas_id));

        if (!assignment) {
            removeFile(fileUrl);

            return res.status(404).json({
                status: "error",
                message: "Tugas tidak ditemukan"
            });
        }

        if (assignment.kelas_id !== student.kelas_id) {
            removeFile(fileUrl);

            return res.status(403).json({
                status: "error",
                message: "Tugas ini bukan untuk kelasmu"
            });
        }

        const existing = db.prepare(
            "SELECT id FROM submissions WHERE tugas_id = ? AND siswa_id = ?"
        ).get(assignment.id, student.id);

        if (existing) {
            removeFile(fileUrl);

            return res.status(409).json({
                status: "error",
                message: "Kamu sudah mengumpulkan tugas ini"
            });
        }

        const status = getSubmissionStatus(assignment.batas_waktu);

        const result = db.prepare(`
            INSERT INTO submissions
                (tugas_id, siswa_id, isi_tugas, file_tugas, status)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            assignment.id,
            student.id,
            isi_tugas ? String(isi_tugas).trim() : null,
            fileUrl,
            status
        );

        res.status(201).json({
            status: "success",
            message: status === "terlambat"
                ? "Tugas berhasil dikumpulkan (terlambat)"
                : "Tugas berhasil dikumpulkan",
            id: result.lastInsertRowid
        });
    } catch (error) {
        removeFile(fileUrl);
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal mengumpulkan tugas"
        });
    }
});

// Memperbarui pengumpulan tugas (siswa)
router.put("/:id", allowRoles("siswa"), upload.single("file"), (req, res) => {
    const newFileUrl = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const id = Number(req.params.id);
        const { isi_tugas } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            removeFile(newFileUrl);

            return res.status(400).json({
                status: "error",
                message: "ID pengumpulan tidak valid"
            });
        }

        const submission = db.prepare(`
            SELECT
                sub.id, sub.siswa_id, sub.isi_tugas, sub.file_tugas,
                a.batas_waktu
            FROM submissions sub
            JOIN assignments a ON a.id = sub.tugas_id
            WHERE sub.id = ?
        `).get(id);

        if (!submission) {
            removeFile(newFileUrl);

            return res.status(404).json({
                status: "error",
                message: "Pengumpulan tugas tidak ditemukan"
            });
        }

        const student = db.prepare(
            "SELECT id FROM students WHERE user_id = ?"
        ).get(req.user.id);

        if (!student || submission.siswa_id !== student.id) {
            removeFile(newFileUrl);

            return res.status(403).json({
                status: "error",
                message: "Kamu hanya bisa mengubah pengumpulan milik sendiri"
            });
        }

        const finalFile = newFileUrl || submission.file_tugas;
        const finalText = isi_tugas !== undefined
            ? String(isi_tugas).trim()
            : String(submission.isi_tugas || "").trim();

        if (!finalText && !finalFile) {
            removeFile(newFileUrl);

            return res.status(400).json({
                status: "error",
                message: "Isi tugas atau file wajib diisi"
            });
        }

        const status = getSubmissionStatus(submission.batas_waktu);

        db.prepare(`
            UPDATE submissions
            SET isi_tugas = ?, file_tugas = ?, status = ?
            WHERE id = ?
        `).run(
            finalText || null,
            finalFile,
            status,
            id
        );

        if (newFileUrl && submission.file_tugas) {
            removeFile(submission.file_tugas);
        }

        res.json({
            status: "success",
            message: "Pengumpulan tugas berhasil diperbarui"
        });
    } catch (error) {
        removeFile(newFileUrl);
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal memperbarui pengumpulan tugas"
        });
    }
});

// Menghapus pengumpulan tugas
router.delete("/:id", allowRoles("admin", "guru"), (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                status: "error",
                message: "ID pengumpulan tidak valid"
            });
        }

        const submission = db.prepare(`
            SELECT sub.id, sub.file_tugas, a.guru_id
            FROM submissions sub
            JOIN assignments a ON a.id = sub.tugas_id
            WHERE sub.id = ?
        `).get(id);

        if (!submission) {
            return res.status(404).json({
                status: "error",
                message: "Pengumpulan tugas tidak ditemukan"
            });
        }

        if (req.user.role === "guru" && submission.guru_id !== req.user.id) {
            return res.status(403).json({
                status: "error",
                message: "Kamu hanya bisa menghapus pengumpulan pada tugas milik sendiri"
            });
        }

        const removeSubmission = db.transaction(() => {
            db.prepare("DELETE FROM grades WHERE submission_id = ?").run(id);
            db.prepare("DELETE FROM submissions WHERE id = ?").run(id);
        });

        removeSubmission();
        removeFile(submission.file_tugas);

        res.json({
            status: "success",
            message: "Pengumpulan tugas berhasil dihapus"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            message: "Gagal menghapus pengumpulan tugas"
        });
    }
});

router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        const message = error.code === "LIMIT_FILE_SIZE"
            ? "Ukuran file maksimal 5 MB"
            : "Gagal mengunggah file: " + error.message;

        return res.status(400).json({
            status: "error",
            message
        });
    }

    if (error) {
        return res.status(400).json({
            status: "error",
            message: error.message
        });
    }

    next();
});

module.exports = router;
