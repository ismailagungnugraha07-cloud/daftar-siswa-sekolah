const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbFolder = path.join(__dirname, "../database");

if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder, { recursive: true });
}

const db = new Database(
    path.join(dbFolder, "sekolah.db")
);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK (
            role IN ('admin', 'guru', 'wali_kelas', 'siswa')
        ),
        status TEXT DEFAULT 'aktif',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama_kelas TEXT NOT NULL,
        jurusan TEXT
    );

    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        nis TEXT UNIQUE,
        kelas_id INTEGER,
        alamat TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(kelas_id) REFERENCES classes(id)
    );

    CREATE TABLE IF NOT EXISTS teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        nip TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama_mapel TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        judul TEXT NOT NULL,
        deskripsi TEXT,
        guru_id INTEGER,
        kelas_id INTEGER,
        batas_waktu DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tugas_id INTEGER NOT NULL,
        siswa_id INTEGER NOT NULL,
        isi_tugas TEXT,
        file_tugas TEXT,
        status TEXT DEFAULT 'terkirim',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tugas_id, siswa_id)
    );

    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tugas_id INTEGER NOT NULL,
        tipe TEXT NOT NULL CHECK (tipe IN ('pilihan_ganda', 'esai')),
        pertanyaan TEXT NOT NULL,
        opsi TEXT,
        jawaban_benar INTEGER,
        bobot INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(tugas_id) REFERENCES assignments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        jawaban TEXT,
        UNIQUE(submission_id, question_id),
        FOREIGN KEY(submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
        FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS grades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id INTEGER NOT NULL,
        nilai REAL,
        komentar TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Migrasi kolom untuk database yang sudah ada
function hasColumn(table, column) {
    return db.prepare(`PRAGMA table_info(${table})`).all()
        .some((item) => item.name === column);
}

if (!hasColumn("classes", "wali_kelas_id")) {
    db.exec("ALTER TABLE classes ADD COLUMN wali_kelas_id INTEGER");
}

if (!hasColumn("assignments", "subject_id")) {
    db.exec("ALTER TABLE assignments ADD COLUMN subject_id INTEGER");
}

for (const column of ["telepon", "alamat", "foto"]) {
    if (!hasColumn("users", column)) {
        db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
    }
}

if (!hasColumn("grades", "created_at")) {
    db.exec("ALTER TABLE grades ADD COLUMN created_at DATETIME");
}

// ---- Fitur absensi & kalender sekolah ----
for (const [column, type] of [["barcode", "TEXT"], ["jenis_kelamin", "TEXT"], ["no_kamar", "TEXT"]]) {
    if (!hasColumn("students", column)) {
        db.exec(`ALTER TABLE students ADD COLUMN ${column} ${type}`);
    }
}

db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    -- Pengecualian kalender: 'libur' (hari aktif jadi libur) atau
    -- 'masuk' (hari yang biasanya libur, misalnya Sabtu, jadi masuk)
    CREATE TABLE IF NOT EXISTS calendar_days (
        tanggal TEXT PRIMARY KEY,
        jenis TEXT NOT NULL CHECK (jenis IN ('libur', 'masuk')),
        keterangan TEXT
    );

    CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        tanggal TEXT NOT NULL,
        status TEXT NOT NULL CHECK (
            status IN ('hadir', 'terlambat', 'izin', 'sakit', 'alpa')
        ),
        jam_masuk TEXT,
        metode TEXT NOT NULL DEFAULT 'manual' CHECK (metode IN ('scan', 'manual')),
        dicatat_oleh INTEGER,
        catatan TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, tanggal),
        FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_tanggal ON attendance(tanggal);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_students_barcode
        ON students(barcode) WHERE barcode IS NOT NULL;

    INSERT OR IGNORE INTO settings (key, value) VALUES
        ('hari_aktif', '1,2,3,4,5'),
        ('jam_masuk', '07:00');

    -- Hari libur nasional yang pasti (tambahkan libur sekolah lain lewat menu Kalender)
    INSERT OR IGNORE INTO calendar_days (tanggal, jenis, keterangan) VALUES
        ('2026-12-25', 'libur', 'Hari Raya Natal'),
        ('2027-01-01', 'libur', 'Tahun Baru Masehi');
`);

// Kode barcode acak (tidak bisa ditebak dari NIS) untuk siswa yang belum punya
const crypto = require("crypto");
const KODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // tanpa karakter yang mirip (0/O, 1/I)

function buatBarcode() {
    for (;;) {
        let kode = "SS";

        for (const b of crypto.randomBytes(8)) kode += KODE[b % KODE.length];

        if (!db.prepare("SELECT 1 FROM students WHERE barcode = ?").get(kode)) return kode;
    }
}

db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_grades_submission
        ON grades(submission_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_nip
        ON teachers(nip)
        WHERE nip IS NOT NULL AND nip <> '';

    CREATE INDEX IF NOT EXISTS idx_students_kelas
        ON students(kelas_id);

    CREATE INDEX IF NOT EXISTS idx_assignments_kelas
        ON assignments(kelas_id);

    CREATE INDEX IF NOT EXISTS idx_questions_tugas
        ON questions(tugas_id);

    CREATE INDEX IF NOT EXISTS idx_submissions_tugas
        ON submissions(tugas_id);
`);

for (const row of db.prepare("SELECT id FROM students WHERE barcode IS NULL").all()) {
    db.prepare("UPDATE students SET barcode = ? WHERE id = ?").run(buatBarcode(), row.id);
}

console.log("Database SQLite berhasil disiapkan!");

module.exports = db;
module.exports.buatBarcode = buatBarcode;
