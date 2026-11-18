const db = require("./config/database");
const bcrypt = require("bcryptjs");

const password = process.env.NEW_ADMIN_PASSWORD;

if (!password || password.length < 6) {
    console.log("Password minimal 6 karakter.");
} else {
    const user = db.prepare(
        "SELECT id FROM users WHERE username = ?"
    ).get("admin");

    if (!user) {
        console.log("Akun admin tidak ditemukan.");
    } else {
        const hash = bcrypt.hashSync(password, 10);

        db.prepare(`
            UPDATE users
            SET password = ?, status = 'aktif'
            WHERE id = ?
        `).run(hash, user.id);

        console.log("Password admin berhasil direset!");
    }
}

db.close();