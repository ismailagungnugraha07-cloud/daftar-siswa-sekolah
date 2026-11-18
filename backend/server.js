require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.error("JWT_SECRET belum diatur atau terlalu pendek (min. 16 karakter) di file .env");
    process.exit(1);
}

const db = require("./config/database");
const { auth } = require("./middleware/auth");

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const classesRoutes = require("./routes/classes");
const studentsRoutes = require("./routes/students");
const teachersRoutes = require("./routes/teachers");
const subjectsRoutes = require("./routes/subjects");
const assignmentsRoutes = require("./routes/assignments");
const submissionsRoutes = require("./routes/submissions");
const gradesRoutes = require("./routes/grades");
const profileRoutes = require("./routes/profile");
const questionsRoutes = require("./routes/questions");
const calendarRoutes = require("./routes/calendar");
const attendanceRoutes = require("./routes/attendance");

const app = express();

app.disable("x-powered-by");
// Matikan upgrade-insecure-requests agar website tetap bisa dibuka lewat http di jaringan lokal
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "img-src": ["'self'", "data:", "blob:"],
            "upgrade-insecure-requests": null
        }
    }
}));
// CORS: hanya aplikasi Android (Capacitor) yang boleh memanggil API dari luar.
// Browser biasa membuka website dari server yang sama, jadi tidak butuh CORS.
const ORIGIN_APLIKASI = [
    "https://localhost",
    "http://localhost",
    "capacitor://localhost",
    "ionic://localhost"
];
app.use(cors({
    origin: (origin, callback) => callback(null, !!origin && ORIGIN_APLIKASI.includes(origin))
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// Menampilkan website
app.use(express.static(path.join(__dirname, "../website")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../website/index.html"));
});

// Batasi percobaan login (anti brute-force)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit."
    }
});

app.use("/api/auth/login", loginLimiter);

// Cek koneksi (dipakai aplikasi Android saat mengisi alamat server)
app.get("/api/ping", (req, res) => {
    res.json({ status: "ok", app: "smart-school" });
});

// API
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/classes", classesRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/teachers", teachersRoutes);
app.use("/api/subjects", subjectsRoutes);
app.use("/api/assignments", assignmentsRoutes);
app.use("/api/submissions", submissionsRoutes);
app.use("/api/grades", gradesRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/questions", questionsRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/attendance", attendanceRoutes);

// Unduh file pengumpulan tugas (hanya pihak yang berhak)
app.get("/api/files/:filename", auth, (req, res) => {
    const filename = path.basename(req.params.filename);
    const fileUrl = "/uploads/" + filename;

    const submission = db.prepare(`
        SELECT sub.id, sub.siswa_id, st.user_id AS siswa_user_id,
               a.guru_id, c.wali_kelas_id
        FROM submissions sub
        JOIN students st ON st.id = sub.siswa_id
        JOIN assignments a ON a.id = sub.tugas_id
        LEFT JOIN classes c ON c.id = a.kelas_id
        WHERE sub.file_tugas = ?
    `).get(fileUrl);

    if (!submission) {
        return res.status(404).json({ status: "error", message: "File tidak ditemukan" });
    }

    const { role, id } = req.user;
    const allowed =
        role === "admin" ||
        (role === "guru" && submission.guru_id === id) ||
        (role === "wali_kelas" && submission.wali_kelas_id === id) ||
        (role === "siswa" && submission.siswa_user_id === id);

    if (!allowed) {
        return res.status(403).json({ status: "error", message: "Kamu tidak memiliki akses" });
    }

    const filePath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ status: "error", message: "File tidak ditemukan" });
    }

    res.download(filePath);
});

// API yang tidak ada
app.use("/api", (req, res) => {
    res.status(404).json({ status: "error", message: "Endpoint tidak ditemukan" });
});

// Penanganan error umum (JSON rusak, dsb.)
app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ status: "error", message: "Format data tidak valid" });
    }

    console.error(error);
    res.status(500).json({ status: "error", message: "Terjadi kesalahan pada server" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("================================");
    console.log(" SMART SCHOOL SERVER AKTIF");
    console.log("================================");
    console.log(`Website: http://localhost:${PORT}`);
});

// HTTPS opsional (dibutuhkan agar kamera HP bisa dipakai untuk scan lewat jaringan WiFi sekolah).
// Aktif otomatis bila ada backend/ssl/key.pem dan backend/ssl/cert.pem (lihat PANDUAN-ABSENSI.md).
const keyFile = path.join(__dirname, "ssl", "key.pem");
const certFile = path.join(__dirname, "ssl", "cert.pem");

if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

    require("https")
        .createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, app)
        .listen(HTTPS_PORT, "0.0.0.0", () => {
            console.log(`Website (HTTPS, untuk kamera HP): https://localhost:${HTTPS_PORT}`);
        });
}
