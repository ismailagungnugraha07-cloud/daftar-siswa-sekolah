const express = require("express");
const db = require("../config/database");
const { auth, allowRoles } = require("../middleware/auth");
const waktu = require("../lib/waktu");

const router = express.Router();

router.use(auth);

const STATUS = ["hadir", "terlambat", "izin", "sakit", "alpa"];
const STAF = ["admin", "guru", "wali_kelas"];

function gagal(res, code, message) {
    return res.status(code).json({ status: "error", message });
}

function errorServer(res, error, pesan) {
    console.error(error);
    gagal(res, 500, pesan);
}

// Admin & guru boleh semua kelas, wali kelas hanya kelas yang ia ampu
function bolehKelas(user, kelasId) {
    if (user.role === "admin" || user.role === "guru") return true;

    const kelas = db.prepare("SELECT wali_kelas_id FROM classes WHERE id = ?").get(kelasId);

    return !!kelas && kelas.wali_kelas_id === user.id;
}

// Validasi tanggal untuk mencatat absensi: harus valid, tidak di masa depan, dan hari aktif
function cekTanggalCatat(tanggal) {
    if (!waktu.tanggalValid(tanggal)) return "Tanggal tidak valid";

    const sekarang = waktu.sekarang();

    if (tanggal > sekarang.tanggal) return "Tidak bisa mencatat absensi untuk tanggal yang belum tiba";

    const hari = waktu.statusHari(tanggal);

    if (!hari.aktif) return `${tanggal} bukan hari aktif: ${hari.alasan}`;

    return null;
}

function simpanAbsen({ studentId, tanggal, status, metode, userId, jam, catatan }) {
    db.prepare(`
        INSERT INTO attendance (student_id, tanggal, status, jam_masuk, metode, dicatat_oleh, catatan, updated_at)
        VALUES (@studentId, @tanggal, @status, @jam, @metode, @userId, @catatan, CURRENT_TIMESTAMP)
        ON CONFLICT(student_id, tanggal) DO UPDATE SET
            status = excluded.status,
            jam_masuk = COALESCE(excluded.jam_masuk, attendance.jam_masuk),
            metode = excluded.metode,
            dicatat_oleh = excluded.dicatat_oleh,
            catatan = excluded.catatan,
            updated_at = CURRENT_TIMESTAMP
    `).run({ studentId, tanggal, status, metode, userId, jam: jam || null, catatan: catatan || null });
}

function hitung(rows) {
    const total = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0 };

    for (const r of rows) if (r.status in total) total[r.status]++;

    return total;
}

function tanggalAtauHariIni(value) {
    return value ? String(value) : waktu.sekarang().tanggal;
}

// ---------- Scan barcode / QR / NIS ----------
router.post("/scan", allowRoles(...STAF), (req, res) => {
    try {
        const kode = String(req.body.kode || "").trim().toUpperCase().slice(0, 40);

        if (!kode) return gagal(res, 400, "Kode kosong");

        const now = waktu.sekarang();
        const hari = waktu.statusHari(now.tanggal);

        if (!hari.aktif) {
            return res.status(409).json({
                status: "error", hasil: "libur",
                message: `Hari ini bukan hari aktif: ${hari.alasan}`
            });
        }

        const siswa = db.prepare(`
            SELECT st.id, st.nis, st.kelas_id, u.nama, u.status AS akun_status,
                   c.nama_kelas, c.wali_kelas_id
            FROM students st
            JOIN users u ON u.id = st.user_id
            LEFT JOIN classes c ON c.id = st.kelas_id
            WHERE st.barcode = ? OR UPPER(st.nis) = ?
            ORDER BY (st.barcode = ?) DESC
            LIMIT 1
        `).get(kode, kode, kode);

        if (!siswa) {
            return res.status(404).json({ status: "error", hasil: "tidak_dikenal", message: "Kode tidak dikenal: " + kode });
        }

        const info = { id: siswa.id, nama: siswa.nama, nis: siswa.nis, kelas: siswa.nama_kelas };

        if (siswa.akun_status !== "aktif") {
            return res.status(403).json({ status: "error", hasil: "nonaktif", siswa: info, message: "Akun siswa nonaktif" });
        }

        if (req.user.role === "wali_kelas" && siswa.wali_kelas_id !== req.user.id) {
            return res.status(403).json({
                status: "error", hasil: "bukan_kelas", siswa: info,
                message: `${siswa.nama} bukan siswa kelas yang kamu ampu (${siswa.nama_kelas || "tanpa kelas"})`
            });
        }

        const ada = db.prepare(
            "SELECT status, jam_masuk, metode FROM attendance WHERE student_id = ? AND tanggal = ?"
        ).get(siswa.id, now.tanggal);

        // Sudah tercatat hadir/terlambat/izin/sakit: jangan ditimpa (alpa boleh dinaikkan)
        if (ada && ada.status !== "alpa") {
            return res.json({
                status: "success", hasil: "sudah_absen", siswa: info,
                absen: { status: ada.status, jam: ada.jam_masuk },
                message: `${siswa.nama} sudah tercatat ${ada.status}` + (ada.jam_masuk ? ` pukul ${ada.jam_masuk.slice(0, 5)}` : "")
            });
        }

        const { jam_masuk: batas } = waktu.bacaPengaturan();
        const status = now.jam.slice(0, 5) <= batas ? "hadir" : "terlambat";

        simpanAbsen({
            studentId: siswa.id, tanggal: now.tanggal, status, metode: "scan",
            userId: req.user.id, jam: now.jam, catatan: null
        });

        res.json({
            status: "success", hasil: "tercatat", siswa: info,
            absen: { status, jam: now.jam },
            message: `${siswa.nama} — ${status === "hadir" ? "HADIR" : "TERLAMBAT"} pukul ${now.jam.slice(0, 5)}`
        });
    } catch (error) {
        errorServer(res, error, "Gagal memproses scan");
    }
});

// ---------- Daftar absensi satu kelas pada satu tanggal ----------
router.get("/kelas", allowRoles(...STAF), (req, res) => {
    try {
        const kelasId = Number(req.query.kelas_id);
        const tanggal = tanggalAtauHariIni(req.query.tanggal);

        if (!Number.isInteger(kelasId) || kelasId <= 0) return gagal(res, 400, "Pilih kelas");
        if (!waktu.tanggalValid(tanggal)) return gagal(res, 400, "Tanggal tidak valid");
        if (!bolehKelas(req.user, kelasId)) return gagal(res, 403, "Kamu tidak memiliki akses ke kelas ini");

        const kelas = db.prepare("SELECT id, nama_kelas FROM classes WHERE id = ?").get(kelasId);

        if (!kelas) return gagal(res, 404, "Kelas tidak ditemukan");

        const students = db.prepare(`
            SELECT st.id, st.nis, st.jenis_kelamin, u.nama,
                   a.status, a.jam_masuk, a.metode, a.catatan
            FROM students st
            JOIN users u ON u.id = st.user_id
            LEFT JOIN attendance a ON a.student_id = st.id AND a.tanggal = ?
            WHERE st.kelas_id = ? AND u.status = 'aktif'
            ORDER BY u.nama COLLATE NOCASE
        `).all(tanggal, kelasId);

        res.json({
            status: "success",
            kelas,
            tanggal,
            hari: waktu.namaHari(tanggal),
            hari_status: waktu.statusHari(tanggal),
            hari_ini: waktu.sekarang().tanggal,
            students,
            ringkasan: { ...hitung(students), belum: students.filter((s) => !s.status).length, total: students.length }
        });
    } catch (error) {
        errorServer(res, error, "Gagal mengambil absensi kelas");
    }
});

// ---------- Absensi manual: satu siswa ----------
router.post("/manual", allowRoles(...STAF), (req, res) => {
    try {
        const studentId = Number(req.body.student_id);
        const { tanggal, status } = req.body;
        const catatan = req.body.catatan ? String(req.body.catatan).trim().slice(0, 200) : null;

        const salah = cekTanggalCatat(tanggal);

        if (salah) return gagal(res, 400, salah);

        if (status !== "belum" && !STATUS.includes(status)) return gagal(res, 400, "Status tidak valid");

        const siswa = db.prepare("SELECT id, kelas_id FROM students WHERE id = ?").get(studentId);

        if (!siswa) return gagal(res, 404, "Siswa tidak ditemukan");
        if (!bolehKelas(req.user, siswa.kelas_id)) return gagal(res, 403, "Kamu tidak memiliki akses ke kelas siswa ini");

        if (status === "belum") {
            db.prepare("DELETE FROM attendance WHERE student_id = ? AND tanggal = ?").run(studentId, tanggal);
        } else {
            const now = waktu.sekarang();

            simpanAbsen({
                studentId, tanggal, status, metode: "manual", userId: req.user.id, catatan,
                jam: tanggal === now.tanggal && (status === "hadir" || status === "terlambat") ? now.jam : null
            });
        }

        res.json({ status: "success", message: "Absensi disimpan" });
    } catch (error) {
        errorServer(res, error, "Gagal menyimpan absensi");
    }
});

// ---------- Absensi manual: satu kelas sekaligus ----------
router.post("/bulk", allowRoles(...STAF), (req, res) => {
    try {
        const kelasId = Number(req.body.kelas_id);
        const { tanggal, items } = req.body;

        const salah = cekTanggalCatat(tanggal);

        if (salah) return gagal(res, 400, salah);
        if (!Number.isInteger(kelasId) || kelasId <= 0) return gagal(res, 400, "Pilih kelas");
        if (!bolehKelas(req.user, kelasId)) return gagal(res, 403, "Kamu tidak memiliki akses ke kelas ini");
        if (!Array.isArray(items) || !items.length) return gagal(res, 400, "Tidak ada data absensi");
        if (items.length > 200) return gagal(res, 400, "Terlalu banyak data dalam satu kali simpan");

        const anggota = new Set(
            db.prepare("SELECT id FROM students WHERE kelas_id = ?").all(kelasId).map((r) => r.id)
        );

        for (const item of items) {
            if (!anggota.has(Number(item.student_id))) return gagal(res, 400, "Ada siswa yang bukan anggota kelas ini");
            if (item.status !== "belum" && !STATUS.includes(item.status)) return gagal(res, 400, "Status tidak valid");
        }

        const now = waktu.sekarang();
        let tersimpan = 0;

        db.transaction(() => {
            for (const item of items) {
                const studentId = Number(item.student_id);

                if (item.status === "belum") {
                    db.prepare("DELETE FROM attendance WHERE student_id = ? AND tanggal = ?").run(studentId, tanggal);
                    continue;
                }

                const lama = db.prepare(
                    "SELECT status, catatan FROM attendance WHERE student_id = ? AND tanggal = ?"
                ).get(studentId, tanggal);
                const catatan = item.catatan ? String(item.catatan).trim().slice(0, 200) : null;

                // Lewati baris yang tidak berubah supaya jejak "scan" & jam masuk tidak hilang
                if (lama && lama.status === item.status && (lama.catatan || null) === catatan) continue;

                simpanAbsen({
                    studentId, tanggal, status: item.status, metode: "manual", userId: req.user.id, catatan,
                    jam: tanggal === now.tanggal && (item.status === "hadir" || item.status === "terlambat") ? now.jam : null
                });
                tersimpan++;
            }
        })();

        res.json({ status: "success", message: `Absensi disimpan (${tersimpan} perubahan)`, perubahan: tersimpan });
    } catch (error) {
        errorServer(res, error, "Gagal menyimpan absensi");
    }
});

// ---------- Tandai semua yang belum tercatat sebagai alpa ----------
router.post("/tandai-alpa", allowRoles(...STAF), (req, res) => {
    try {
        const kelasId = Number(req.body.kelas_id);
        const { tanggal } = req.body;
        const salah = cekTanggalCatat(tanggal);

        if (salah) return gagal(res, 400, salah);
        if (!Number.isInteger(kelasId) || kelasId <= 0) return gagal(res, 400, "Pilih kelas");
        if (!bolehKelas(req.user, kelasId)) return gagal(res, 403, "Kamu tidak memiliki akses ke kelas ini");

        const kosong = db.prepare(`
            SELECT st.id FROM students st
            JOIN users u ON u.id = st.user_id
            WHERE st.kelas_id = ? AND u.status = 'aktif'
              AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = st.id AND a.tanggal = ?)
        `).all(kelasId, tanggal);

        db.transaction(() => {
            for (const r of kosong) {
                simpanAbsen({ studentId: r.id, tanggal, status: "alpa", metode: "manual", userId: req.user.id });
            }
        })();

        res.json({ status: "success", message: `${kosong.length} siswa ditandai alpa`, jumlah: kosong.length });
    } catch (error) {
        errorServer(res, error, "Gagal menandai alpa");
    }
});

// ---------- Aktivitas terbaru hari ini (untuk halaman scan) ----------
router.get("/terbaru", allowRoles(...STAF), (req, res) => {
    try {
        const now = waktu.sekarang();
        const params = [now.tanggal];
        let filter = "";

        if (req.user.role === "wali_kelas") {
            filter = "AND c.wali_kelas_id = ?";
            params.push(req.user.id);
        }

        const rows = db.prepare(`
            SELECT a.id, a.status, a.jam_masuk, a.metode, u.nama, st.nis, c.nama_kelas
            FROM attendance a
            JOIN students st ON st.id = a.student_id
            JOIN users u ON u.id = st.user_id
            LEFT JOIN classes c ON c.id = st.kelas_id
            WHERE a.tanggal = ? ${filter}
            ORDER BY a.updated_at DESC, a.id DESC
            LIMIT 30
        `).all(...params);

        res.json({ status: "success", tanggal: now.tanggal, absensi: rows });
    } catch (error) {
        errorServer(res, error, "Gagal mengambil aktivitas terbaru");
    }
});

// ---------- Rekap bulanan satu kelas ----------
function susunRekap(kelasId, bulan) {
    const now = waktu.sekarang();
    const pengaturan = waktu.bacaPengaturan();
    const pengecualian = new Map(
        db.prepare("SELECT tanggal, jenis, keterangan FROM calendar_days WHERE tanggal LIKE ?")
            .all(bulan + "-%").map((r) => [r.tanggal, r])
    );
    const jumlah = new Date(Date.UTC(Number(bulan.slice(0, 4)), Number(bulan.slice(5)), 0)).getUTCDate();
    const tanggalAktif = [];

    for (let d = 1; d <= jumlah; d++) {
        const t = `${bulan}-${String(d).padStart(2, "0")}`;

        if (t <= now.tanggal && waktu.statusHari(t, pengaturan, pengecualian).aktif) tanggalAktif.push(t);
    }

    const siswa = db.prepare(`
        SELECT st.id, st.nis, u.nama
        FROM students st JOIN users u ON u.id = st.user_id
        WHERE st.kelas_id = ? AND u.status = 'aktif'
        ORDER BY u.nama COLLATE NOCASE
    `).all(kelasId);

    const catatan = db.prepare(`
        SELECT a.student_id, a.tanggal, a.status
        FROM attendance a JOIN students st ON st.id = a.student_id
        WHERE st.kelas_id = ? AND a.tanggal LIKE ?
    `).all(kelasId, bulan + "-%");

    const peta = new Map();

    for (const c of catatan) {
        if (!peta.has(c.student_id)) peta.set(c.student_id, {});

        peta.get(c.student_id)[c.tanggal] = c.status;
    }

    const rows = siswa.map((s) => {
        const hari = peta.get(s.id) || {};
        const total = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0 };
        let efektif = 0;

        for (const t of tanggalAktif) {
            const st = hari[t];

            if (st) {
                total[st]++;
                efektif++;
            } else if (t < now.tanggal) {
                // Hari yang sudah lewat tanpa catatan dihitung alpa; hari ini masih "belum"
                total.alpa++;
                efektif++;
            }
        }

        return {
            ...s, hari, ...total, hari_efektif: efektif,
            persen: efektif ? Math.round(((total.hadir + total.terlambat) / efektif) * 1000) / 10 : null
        };
    });

    return { tanggal_aktif: tanggalAktif, siswa: rows };
}

router.get("/rekap", allowRoles(...STAF), (req, res) => {
    try {
        const kelasId = Number(req.query.kelas_id);
        const bulan = String(req.query.bulan || waktu.sekarang().tanggal.slice(0, 7));

        if (!Number.isInteger(kelasId) || kelasId <= 0) return gagal(res, 400, "Pilih kelas");
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) return gagal(res, 400, "Format bulan harus YYYY-MM");
        if (!bolehKelas(req.user, kelasId)) return gagal(res, 403, "Kamu tidak memiliki akses ke kelas ini");

        const kelas = db.prepare("SELECT id, nama_kelas FROM classes WHERE id = ?").get(kelasId);

        if (!kelas) return gagal(res, 404, "Kelas tidak ditemukan");

        res.json({ status: "success", kelas, bulan, ...susunRekap(kelasId, bulan) });
    } catch (error) {
        errorServer(res, error, "Gagal menyusun rekap");
    }
});

// ---------- Ringkasan hari ini (dashboard) ----------
router.get("/ringkasan", (req, res) => {
    try {
        const now = waktu.sekarang();
        const hari = waktu.statusHari(now.tanggal);
        const kosong = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0 };

        if (req.user.role === "siswa") {
            const siswa = db.prepare("SELECT id FROM students WHERE user_id = ?").get(req.user.id);
            const a = siswa && db.prepare(
                "SELECT status, jam_masuk FROM attendance WHERE student_id = ? AND tanggal = ?"
            ).get(siswa.id, now.tanggal);

            return res.json({
                status: "success", tanggal: now.tanggal, hari_status: hari,
                saya: a ? { status: a.status, jam: a.jam_masuk } : null
            });
        }

        const params = [now.tanggal];
        let filter = "";

        if (req.user.role === "wali_kelas") {
            filter = "AND c.wali_kelas_id = ?";
            params.push(req.user.id);
        }

        const baris = db.prepare(`
            SELECT c.id AS kelas_id, c.nama_kelas, st.id AS student_id, a.status
            FROM students st
            JOIN users u ON u.id = st.user_id AND u.status = 'aktif'
            JOIN classes c ON c.id = st.kelas_id
            LEFT JOIN attendance a ON a.student_id = st.id AND a.tanggal = ?
            WHERE 1 = 1 ${filter}
            ORDER BY c.nama_kelas COLLATE NOCASE
        `).all(...params);

        const perKelas = new Map();
        const total = { ...kosong, belum: 0, total: 0 };

        for (const r of baris) {
            if (!perKelas.has(r.kelas_id)) {
                perKelas.set(r.kelas_id, { kelas_id: r.kelas_id, nama_kelas: r.nama_kelas, ...kosong, belum: 0, total: 0 });
            }

            const k = perKelas.get(r.kelas_id);

            for (const t of [k, total]) {
                t.total++;

                if (r.status) t[r.status]++;
                else t.belum++;
            }
        }

        res.json({
            status: "success", tanggal: now.tanggal, hari_status: hari,
            total, per_kelas: [...perKelas.values()]
        });
    } catch (error) {
        errorServer(res, error, "Gagal mengambil ringkasan absensi");
    }
});

// ---------- Absensi saya (siswa) ----------
router.get("/saya", allowRoles("siswa"), (req, res) => {
    try {
        const now = waktu.sekarang();
        const bulan = String(req.query.bulan || now.tanggal.slice(0, 7));

        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) return gagal(res, 400, "Format bulan harus YYYY-MM");

        const siswa = db.prepare(`
            SELECT st.id, st.user_id, st.nis, st.barcode, st.kelas_id, st.no_kamar, u.nama, c.nama_kelas,
                   (u.foto IS NOT NULL AND u.foto <> '') AS has_photo
            FROM students st JOIN users u ON u.id = st.user_id
            LEFT JOIN classes c ON c.id = st.kelas_id
            WHERE st.user_id = ?
        `).get(req.user.id);

        if (!siswa) return gagal(res, 404, "Data siswa belum dihubungkan oleh admin");

        const rekap = siswa.kelas_id ? susunRekap(siswa.kelas_id, bulan) : { tanggal_aktif: [], siswa: [] };
        const saya = rekap.siswa.find((s) => s.id === siswa.id);

        res.json({
            status: "success", bulan, hari_ini: now.tanggal, siswa,
            tanggal_aktif: rekap.tanggal_aktif,
            ringkasan: saya
                ? { hadir: saya.hadir, terlambat: saya.terlambat, izin: saya.izin, sakit: saya.sakit, alpa: saya.alpa, hari_efektif: saya.hari_efektif, persen: saya.persen }
                : null,
            hari: saya ? saya.hari : {}
        });
    } catch (error) {
        errorServer(res, error, "Gagal mengambil absensi");
    }
});

module.exports = router;
