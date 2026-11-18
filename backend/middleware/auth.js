const jwt = require("jsonwebtoken");
const db = require("../config/database");

function auth(req, res, next) {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({
            status: "error",
            message: "Silakan login terlebih dahulu"
        });
    }

    try {
        const token = header.split(" ")[1];

        const payload = jwt.verify(token, process.env.JWT_SECRET);

        // Pastikan akun masih ada, aktif, dan role-nya terbaru
        const user = db.prepare(
            "SELECT id, username, role, status FROM users WHERE id = ?"
        ).get(payload.id);

        if (!user || user.status !== "aktif") {
            return res.status(401).json({
                status: "error",
                message: "Akun tidak aktif atau sudah dihapus"
            });
        }

        req.user = {
            id: user.id,
            username: user.username,
            role: user.role
        };

        next();
    } catch (error) {
        return res.status(401).json({
            status: "error",
            message: "Token tidak valid atau sudah kedaluwarsa"
        });
    }
}

function allowRoles(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                status: "error",
                message: "Kamu tidak memiliki akses"
            });
        }

        next();
    };
}

module.exports = { auth, allowRoles };
