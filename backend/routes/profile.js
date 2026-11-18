const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const db = require("../config/database");
const { auth } = require("../middleware/auth");

const router = express.Router();

const photoDir = path.join(__dirname, "../uploads/profile");

if (!fs.existsSync(photoDir)) {
    fs.mkdirSync(photoDir, { recursive: true });
}

const photoExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, callback) => callback(null, photoDir),
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname).toLowerCase();

            callback(null, req.user.id + "-" + crypto.randomBytes(8).toString("hex") + extension);
        }
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();

        if (!photoExtensions.has(extension)) {
            return callback(new Error("Foto harus berformat JPG, PNG, atau WEBP"));
        }

        callback(null, true);
    }
});

// Cek isi file benar-benar gambar (bukan hanya ekstensi)
function looksLikeImage(filePath) {
    const buffer = Buffer.alloc(12);
    const fd = fs.openSync(filePath, "r");

    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp = buffer.slice(0, 4).toString() === "RIFF" && buffer.slice(8, 12).toString() === "WEBP";

    return isJpeg || isPng || isWebp;
}

function removePhoto(filename) {
    if (!filename) return;

    fs.unlink(path.join(photoDir, path.basename(filename)), () => {});
}

function getProfile(userId) {
    const user = db.prepare(`
        SELECT id, nama, username, role, status, telepon, alamat, foto, created_at
        FROM users WHERE id = ?
    `).get(userId);

    if (!user) return null;

    if (user.role === "siswa") {
        const student = db.prepare(`
            SELECT s.nis, s.alamat, c.nama_kelas
            FROM students s
            LEFT JOIN classes c ON c.id = s.kelas_id
            WHERE s.user_id = ?
        `).get(userId);

        if (student) {
            user.nis = student.nis;
            user.nama_kelas = student.nama_kelas;
            user.alamat = student.alamat || user.alamat;
        }
    }

    if (user.role === "guru" || user.role === "wali_kelas") {
        const teacher = db.prepare("SELECT nip FROM teachers WHERE user_id = ?").get(userId);
        const wali = db.prepare("SELECT nama_kelas FROM classes WHERE wali_kelas_id = ?").all(userId);

        user.nip = teacher ? teacher.nip : null;
        user.kelas_wali = wali.map((c) => c.nama_kelas).join(", ") || null;
    }

    user.has_photo = Boolean(user.foto);
    delete user.foto;

    return user;
}

router.use(auth);

router.get("/", (req, res) => {
    const profile = getProfile(req.user.id);

    if (!profile) {
        return res.status(404).json({ status: "error", message: "Pengguna tidak ditemukan" });
    }

    res.json({ status: "success", profile });
});

router.put("/", (req, res) => {
    const nama = String(req.body.nama || "").trim();
    const telepon = String(req.body.telepon || "").trim();
    const alamat = String(req.body.alamat || "").trim();

    if (!nama || nama.length > 100) {
        return res.status(400).json({ status: "error", message: "Nama wajib diisi (maksimal 100 karakter)" });
    }

    if (telepon && !/^[0-9+\-\s]{8,20}$/.test(telepon)) {
        return res.status(400).json({ status: "error", message: "Nomor HP tidak valid (8–20 digit)" });
    }

    if (alamat.length > 300) {
        return res.status(400).json({ status: "error", message: "Alamat maksimal 300 karakter" });
    }

    db.transaction(() => {
        db.prepare("UPDATE users SET nama = ?, telepon = ?, alamat = ? WHERE id = ?")
            .run(nama, telepon || null, alamat || null, req.user.id);

        if (req.user.role === "siswa") {
            db.prepare("UPDATE students SET alamat = ? WHERE user_id = ?")
                .run(alamat || null, req.user.id);
        }
    })();

    res.json({ status: "success", message: "Data diri berhasil disimpan", profile: getProfile(req.user.id) });
});

router.put("/password", (req, res) => {
    const current = String(req.body.current_password || "");
    const next = String(req.body.new_password || "");

    if (next.length < 6 || next.length > 72) {
        return res.status(400).json({ status: "error", message: "Password baru minimal 6 karakter" });
    }

    const user = db.prepare("SELECT password FROM users WHERE id = ?").get(req.user.id);

    if (!user || !bcrypt.compareSync(current, user.password)) {
        return res.status(400).json({ status: "error", message: "Password lama salah" });
    }

    db.prepare("UPDATE users SET password = ? WHERE id = ?")
        .run(bcrypt.hashSync(next, 10), req.user.id);

    res.json({ status: "success", message: "Password berhasil diganti" });
});

router.post("/photo", (req, res) => {
    upload.single("foto")(req, res, (error) => {
        if (error) {
            const message = error.code === "LIMIT_FILE_SIZE" ? "Ukuran foto maksimal 2 MB" : error.message;

            return res.status(400).json({ status: "error", message });
        }

        if (!req.file) {
            return res.status(400).json({ status: "error", message: "Pilih foto terlebih dahulu" });
        }

        if (!looksLikeImage(req.file.path)) {
            removePhoto(req.file.filename);

            return res.status(400).json({ status: "error", message: "File bukan gambar yang valid" });
        }

        const old = db.prepare("SELECT foto FROM users WHERE id = ?").get(req.user.id);

        db.prepare("UPDATE users SET foto = ? WHERE id = ?").run(req.file.filename, req.user.id);
        removePhoto(old && old.foto);

        res.json({ status: "success", message: "Foto profil diperbarui" });
    });
});

router.delete("/photo", (req, res) => {
    const old = db.prepare("SELECT foto FROM users WHERE id = ?").get(req.user.id);

    db.prepare("UPDATE users SET foto = NULL WHERE id = ?").run(req.user.id);
    removePhoto(old && old.foto);

    res.json({ status: "success", message: "Foto profil dihapus" });
});

// Foto dapat dilihat semua pengguna yang sudah login (untuk avatar)
router.get("/photo/:userId", (req, res) => {
    const row = db.prepare("SELECT foto FROM users WHERE id = ?").get(Number(req.params.userId));

    if (!row || !row.foto) {
        return res.status(404).json({ status: "error", message: "Foto tidak ada" });
    }

    const filePath = path.join(photoDir, path.basename(row.foto));

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ status: "error", message: "Foto tidak ada" });
    }

    res.sendFile(filePath);
});

module.exports = router;
