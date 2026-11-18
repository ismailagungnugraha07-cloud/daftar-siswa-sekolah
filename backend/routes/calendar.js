const express = require("express");
const db = require("../config/database");
const { auth, allowRoles } = require("../middleware/auth");
const waktu = require("../lib/waktu");

const router = express.Router();

router.use(auth);

function gagal(res, code, message) {
    return res.status(code).json({ status: "error", message });
}

// Waktu server saat ini + status hari ini (dipakai jam real-time di semua halaman)
router.get("/today", (req, res) => {
    const now = waktu.sekarang();
    const pengaturan = waktu.bacaPengaturan();

    res.json({
        status: "success",
        now: {
            epoch: now.epoch,
            tanggal: now.tanggal,
            jam: now.jam,
            hari: waktu.namaHari(now.tanggal),
            zona: waktu.TZ
        },
        hari_ini: waktu.statusHari(now.tanggal, pengaturan),
        jam_masuk: pengaturan.jam_masuk
    });
});

// Kalender satu bulan (?bulan=YYYY-MM): status tiap tanggal
router.get("/", (req, res) => {
    try {
        const now = waktu.sekarang();
        const bulan = String(req.query.bulan || now.tanggal.slice(0, 7));

        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) {
            return gagal(res, 400, "Format bulan harus YYYY-MM");
        }

        const pengaturan = waktu.bacaPengaturan();
        const pengecualian = new Map(
            db.prepare("SELECT tanggal, jenis, keterangan FROM calendar_days WHERE tanggal LIKE ?")
                .all(bulan + "-%").map((r) => [r.tanggal, r])
        );

        const jumlah = new Date(Date.UTC(Number(bulan.slice(0, 4)), Number(bulan.slice(5)), 0)).getUTCDate();
        const days = [];

        for (let d = 1; d <= jumlah; d++) {
            const tanggal = `${bulan}-${String(d).padStart(2, "0")}`;

            days.push({
                tanggal,
                hari_ke: waktu.hariKe(tanggal),
                ...waktu.statusHari(tanggal, pengaturan, pengecualian)
            });
        }

        res.json({
            status: "success",
            bulan,
            hari_ini: now.tanggal,
            pengaturan,
            days
        });
    } catch (error) {
        console.error(error);
        gagal(res, 500, "Gagal mengambil kalender");
    }
});

// Daftar semua pengecualian (hari libur / hari masuk khusus)
router.get("/days", (req, res) => {
    const days = db.prepare(
        "SELECT tanggal, jenis, keterangan FROM calendar_days ORDER BY tanggal"
    ).all();

    res.json({ status: "success", days });
});

// Ubah pengaturan (admin): hari aktif mingguan & batas jam masuk
router.put("/settings", allowRoles("admin"), (req, res) => {
    try {
        const { hari_aktif, jam_masuk } = req.body;

        if (!Array.isArray(hari_aktif) || !hari_aktif.length ||
            !hari_aktif.every((n) => Number.isInteger(n) && n >= 1 && n <= 7)) {
            return gagal(res, 400, "Pilih minimal satu hari aktif (1 = Senin ... 7 = Minggu)");
        }

        if (typeof jam_masuk !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(jam_masuk)) {
            return gagal(res, 400, "Jam masuk harus berformat HH:MM");
        }

        const simpan = db.prepare(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        );

        db.transaction(() => {
            simpan.run("hari_aktif", [...new Set(hari_aktif)].sort().join(","));
            simpan.run("jam_masuk", jam_masuk);
        })();

        res.json({ status: "success", message: "Pengaturan kalender disimpan", pengaturan: waktu.bacaPengaturan() });
    } catch (error) {
        console.error(error);
        gagal(res, 500, "Gagal menyimpan pengaturan");
    }
});

// Tambah libur / hari masuk khusus untuk rentang tanggal (admin)
router.post("/days", allowRoles("admin"), (req, res) => {
    try {
        const { dari, sampai, jenis, keterangan } = req.body;
        const akhir = sampai || dari;

        if (!waktu.tanggalValid(dari) || !waktu.tanggalValid(akhir)) {
            return gagal(res, 400, "Tanggal tidak valid");
        }

        if (!["libur", "masuk"].includes(jenis)) {
            return gagal(res, 400, "Jenis harus 'libur' atau 'masuk'");
        }

        if (akhir < dari) return gagal(res, 400, "Tanggal akhir tidak boleh sebelum tanggal awal");

        const selisih = (new Date(akhir) - new Date(dari)) / 86400000;

        if (selisih > 366) return gagal(res, 400, "Rentang maksimal 1 tahun");

        const ket = keterangan ? String(keterangan).trim().slice(0, 120) : null;
        const simpan = db.prepare(`
            INSERT INTO calendar_days (tanggal, jenis, keterangan) VALUES (?, ?, ?)
            ON CONFLICT(tanggal) DO UPDATE SET jenis = excluded.jenis, keterangan = excluded.keterangan
        `);

        db.transaction(() => {
            for (let t = dari; t <= akhir; t = waktu.tambahHari(t, 1)) simpan.run(t, jenis, ket);
        })();

        res.status(201).json({
            status: "success",
            message: `${selisih + 1} tanggal ditandai sebagai ${jenis === "libur" ? "libur" : "hari masuk"}`
        });
    } catch (error) {
        console.error(error);
        gagal(res, 500, "Gagal menyimpan kalender");
    }
});

router.delete("/days/:tanggal", allowRoles("admin"), (req, res) => {
    if (!waktu.tanggalValid(req.params.tanggal)) return gagal(res, 400, "Tanggal tidak valid");

    const hasil = db.prepare("DELETE FROM calendar_days WHERE tanggal = ?").run(req.params.tanggal);

    if (!hasil.changes) return gagal(res, 404, "Tanggal tidak ditemukan di daftar pengecualian");

    res.json({ status: "success", message: "Pengecualian dihapus, tanggal kembali mengikuti jadwal mingguan" });
});

module.exports = router;
