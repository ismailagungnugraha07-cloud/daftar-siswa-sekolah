
require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("./config/database");

const username = "admin";
const password = "AdminSekolah#2026";
const nama = "Administrator Sekolah";

try {
    const existing = db.prepare(
        "SELECT id FROM users WHERE username = ?"
    ).get(username);

    if (existing) {
        console.log("Akun admin sudah tersedia!");
        process.exit(0);
    }

    const hashedPassword = bcrypt.hashSync(password, 12);

    db.prepare(`
        INSERT INTO users (nama, username, password, role)
        VALUES (?, ?, ?, ?)
    `).run(
        nama,
        username,
        hashedPassword,
        "admin"
    );

    console.log("Akun admin berhasil dibuat!");
    console.log("Username: " + username);
    console.log("Password: " + password);
    console.log("Segera ganti password setelah login pertama.");

} catch (error) {
    console.error("Gagal membuat admin:", error.message);
}

db.close();
