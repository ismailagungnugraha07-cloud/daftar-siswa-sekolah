const db = require("./config/database");

const users = db.prepare(
    "SELECT id, nama, username, role, status, created_at FROM users"
).all();

const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
).all();

console.log("=== USER ===");
console.table(users);

console.log("=== TABEL ===");
console.table(tables);

db.close();
