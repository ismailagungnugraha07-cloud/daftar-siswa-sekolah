const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/database");
const { auth } = require("../middleware/auth");

const router = express.Router();

router.post("/login", (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                status: "error",
                message: "Username dan password wajib diisi"
            });
        }

        const user = db.prepare(`
            SELECT id, nama, username, password, role, status
            FROM users
            WHERE username = ?
        `).get(username.trim());

        if (!user || user.status !== "aktif") {
            return res.status(401).json({
                status: "error",
                message: "Username atau password salah"
            });
        }

        const validPassword = bcrypt.compareSync(
            password,
            user.password
        );

        if (!validPassword) {
            return res.status(401).json({
                status: "error",
                message: "Username atau password salah"
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: "8h" }
        );

        res.json({
            status: "success",
            message: "Login berhasil",
            token,
            user: {
                id: user.id,
                nama: user.nama,
                username: user.username,
                role: user.role
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            status: "error",
            message: "Terjadi kesalahan pada server"
        });
    }
});

router.get("/me", auth, (req, res) => {
    const user = db.prepare(`
        SELECT id, nama, username, role
        FROM users
        WHERE id = ?
    `).get(req.user.id);

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
});


router.get("/stats", auth, (req, res) => {
    try {
        const role = req.user.role;
        let statistics = {};

        if (role === "admin") {
            const totalUsers = db.prepare(
                "SELECT COUNT(*) AS total FROM users"
            ).get().total;

            const totalStudents = db.prepare(
                "SELECT COUNT(*) AS total FROM users WHERE role = 'siswa'"
            ).get().total;

            const totalTeachers = db.prepare(
                "SELECT COUNT(*) AS total FROM users WHERE role IN ('guru', 'wali_kelas')"
            ).get().total;

            const totalClasses = db.prepare(
                "SELECT COUNT(*) AS total FROM classes"
            ).get().total;

            const totalSubjects = db.prepare(
                "SELECT COUNT(*) AS total FROM subjects"
            ).get().total;

            const totalAssignments = db.prepare(
                "SELECT COUNT(*) AS total FROM assignments"
            ).get().total;

            const totalSubmissions = db.prepare(
                "SELECT COUNT(*) AS total FROM submissions"
            ).get().total;

            const totalGrades = db.prepare(
                "SELECT COUNT(*) AS total FROM grades"
            ).get().total;

            statistics = {
                totalUsers,
                totalStudents,
                totalTeachers,
                totalClasses,
                totalSubjects,
                totalAssignments,
                totalSubmissions,
                totalGrades
            };
        } else if (role === "guru") {
            const totalAssignments = db.prepare(
                "SELECT COUNT(*) AS total FROM assignments WHERE guru_id = ?"
            ).get(req.user.id).total;

            const totalSubmissions = db.prepare(`
                SELECT COUNT(*) AS total
                FROM submissions sub
                JOIN assignments a ON a.id = sub.tugas_id
                WHERE a.guru_id = ?
            `).get(req.user.id).total;

            const totalUngraded = db.prepare(`
                SELECT COUNT(*) AS total
                FROM submissions sub
                JOIN assignments a ON a.id = sub.tugas_id
                LEFT JOIN grades g ON g.submission_id = sub.id
                WHERE a.guru_id = ? AND g.id IS NULL
            `).get(req.user.id).total;

            const totalGraded = db.prepare(`
                SELECT COUNT(*) AS total
                FROM grades g
                JOIN submissions sub ON sub.id = g.submission_id
                JOIN assignments a ON a.id = sub.tugas_id
                WHERE a.guru_id = ?
            `).get(req.user.id).total;

            const totalStudents = db.prepare(`
                SELECT COUNT(DISTINCT st.id) AS total
                FROM students st
                WHERE st.kelas_id IN (
                    SELECT kelas_id FROM assignments WHERE guru_id = ?
                )
            `).get(req.user.id).total;

            statistics = {
                totalAssignments,
                totalSubmissions,
                totalUngraded,
                totalGraded,
                totalStudents
            };
        } else if (role === "wali_kelas") {
            const classes = db.prepare(
                "SELECT id, nama_kelas FROM classes WHERE wali_kelas_id = ?"
            ).all(req.user.id);

            if (!classes.length) {
                statistics = {
                    className: "-",
                    totalStudents: 0,
                    totalAssignments: 0,
                    totalSubmissions: 0,
                    averageGrade: 0
                };
            } else {
                const classIds = classes.map((item) => item.id);
                const placeholders = classIds.map(() => "?").join(", ");

                const totalStudents = db.prepare(`
                    SELECT COUNT(*) AS total
                    FROM students
                    WHERE kelas_id IN (${placeholders})
                `).get(...classIds).total;

                const totalAssignments = db.prepare(`
                    SELECT COUNT(*) AS total
                    FROM assignments
                    WHERE kelas_id IN (${placeholders})
                `).get(...classIds).total;

                const totalSubmissions = db.prepare(`
                    SELECT COUNT(*) AS total
                    FROM submissions sub
                    JOIN assignments a ON a.id = sub.tugas_id
                    WHERE a.kelas_id IN (${placeholders})
                `).get(...classIds).total;

                const averageGrade = db.prepare(`
                    SELECT AVG(g.nilai) AS average
                    FROM grades g
                    JOIN submissions sub ON sub.id = g.submission_id
                    JOIN assignments a ON a.id = sub.tugas_id
                    WHERE a.kelas_id IN (${placeholders})
                `).get(...classIds).average;

                statistics = {
                    className: classes.map((item) => item.nama_kelas).join(", "),
                    totalStudents,
                    totalAssignments,
                    totalSubmissions,
                    averageGrade: averageGrade ? Number(averageGrade.toFixed(2)) : 0
                };
            }
        } else if (role === "siswa") {
            const student = db.prepare(`
                SELECT st.id, st.kelas_id, c.nama_kelas
                FROM students st
                LEFT JOIN classes c ON c.id = st.kelas_id
                WHERE st.user_id = ?
            `).get(req.user.id);

            if (!student) {
                statistics = {
                    className: "-",
                    totalAssignments: 0,
                    totalSubmitted: 0,
                    totalPending: 0,
                    totalGraded: 0,
                    averageGrade: 0
                };
            } else {
                const totalAssignments = db.prepare(`
                    SELECT COUNT(*) AS total
                    FROM assignments
                    WHERE kelas_id = ?
                `).get(student.kelas_id).total;

                const totalSubmitted = db.prepare(`
                    SELECT COUNT(*) AS total
                    FROM submissions
                    WHERE siswa_id = ?
                `).get(student.id).total;

                const totalGraded = db.prepare(`
                    SELECT COUNT(*) AS total
                    FROM grades g
                    JOIN submissions sub ON sub.id = g.submission_id
                    WHERE sub.siswa_id = ?
                `).get(student.id).total;

                const averageGrade = db.prepare(`
                    SELECT AVG(g.nilai) AS average
                    FROM grades g
                    JOIN submissions sub ON sub.id = g.submission_id
                    WHERE sub.siswa_id = ?
                `).get(student.id).average;

                statistics = {
                    className: student.nama_kelas || "-",
                    totalAssignments,
                    totalSubmitted,
                    totalPending: Math.max(totalAssignments - totalSubmitted, 0),
                    totalGraded,
                    averageGrade: averageGrade ? Number(averageGrade.toFixed(2)) : 0
                };
            }
        } else {
            return res.status(403).json({
                status: "error",
                message: "Role pengguna tidak dikenali"
            });
        }

        res.json({
            status: "success",
            statistics
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            status: "error",
            message: "Gagal mengambil statistik"
        });
    }
});


module.exports = router;
