/* Waktu & kalender sekolah (zona waktu sekolah, default Asia/Jakarta / WIB).
   Semua perhitungan "hari ini" dilakukan di server supaya tidak bisa
   dipalsukan lewat jam perangkat siswa/guru. */
const db = require("../config/database");

const TZ = process.env.TZ_SEKOLAH || "Asia/Jakarta";

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
});

function sekarang(date = new Date()) {
    const p = {};

    for (const part of fmt.formatToParts(date)) p[part.type] = part.value;

    return {
        epoch: date.getTime(),
        tanggal: `${p.year}-${p.month}-${p.day}`,
        jam: `${p.hour}:${p.minute}:${p.second}`
    };
}

function tanggalValid(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const d = new Date(value + "T00:00:00Z");

    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// 1 = Senin ... 7 = Minggu
function hariKe(tanggal) {
    const g = new Date(tanggal + "T00:00:00Z").getUTCDay();

    return g === 0 ? 7 : g;
}

function namaHari(tanggal) {
    return HARI[new Date(tanggal + "T00:00:00Z").getUTCDay()];
}

function tambahHari(tanggal, n) {
    const d = new Date(tanggal + "T00:00:00Z");

    d.setUTCDate(d.getUTCDate() + n);

    return d.toISOString().slice(0, 10);
}

function bacaPengaturan() {
    const rows = db.prepare("SELECT key, value FROM settings").all();
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    return {
        hari_aktif: String(map.hari_aktif || "1,2,3,4,5")
            .split(",").map(Number).filter((n) => n >= 1 && n <= 7),
        jam_masuk: map.jam_masuk || "07:00"
    };
}

// Status satu tanggal: { aktif, jenis, alasan }
function statusHari(tanggal, pengaturan = bacaPengaturan(), pengecualian = null) {
    const ex = pengecualian
        ? pengecualian.get(tanggal)
        : db.prepare("SELECT jenis, keterangan FROM calendar_days WHERE tanggal = ?").get(tanggal);

    if (ex) {
        return ex.jenis === "libur"
            ? { aktif: false, jenis: "libur", alasan: ex.keterangan || "Hari libur" }
            : { aktif: true, jenis: "masuk", alasan: ex.keterangan || "Hari masuk khusus" };
    }

    if (pengaturan.hari_aktif.includes(hariKe(tanggal))) {
        return { aktif: true, jenis: "reguler", alasan: "" };
    }

    return { aktif: false, jenis: "akhir_pekan", alasan: "Bukan hari belajar (" + namaHari(tanggal) + ")" };
}

module.exports = {
    TZ, sekarang, tanggalValid, hariKe, namaHari, tambahHari,
    bacaPengaturan, statusHari
};
