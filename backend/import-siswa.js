/* Impor data siswa dari data/siswa-kamar.json (hasil ekstrak DAFTAR_PEMBAGIAN_KAMAR_HOTEL.xlsx).
   Aman dijalankan berulang: siswa yang sudah ada (nama + kelas sama) dilewati.
   Jalankan:  npm run isi-data
   Hasil: akun-siswa-baru.csv berisi username & password awal (bagikan, lalu HAPUS file-nya). */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("./config/database");

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "data/siswa-kamar.json"), "utf8"));

const JURUSAN = {
    TKR: "Teknik Kendaraan Ringan",
    TSM: "Teknik Sepeda Motor",
    DPIB: "Desain Pemodelan dan Informasi Bangunan",
    RPL: "Rekayasa Perangkat Lunak",
    PBS: "Perbankan Syariah",
    ANIMASI: "Animasi"
};

function jurusanDari(namaKelas) {
    const kode = Object.keys(JURUSAN).find((k) => namaKelas.split(" ").includes(k));

    return kode ? JURUSAN[kode] : null;
}

function passwordAcak() {
    const huruf = "abcdefghijkmnpqrstuvwxyz23456789";
    let p = "";

    for (const b of crypto.randomBytes(8)) p += huruf[b % huruf.length];

    return p;
}

const tahun = String(new Date().getFullYear()).slice(2);

function nisBerikut() {
    // NIS sementara: TTKKNNNN (tahun, tingkat 11, nomor urut). Ganti dengan NIS asli di menu Data Siswa.
    const prefix = tahun + "11";
    const last = db.prepare("SELECT nis FROM students WHERE nis LIKE ? ORDER BY nis DESC LIMIT 1").get(prefix + "%");
    const n = last ? Number(last.nis.slice(prefix.length)) + 1 : 1;

    return prefix + String(n).padStart(4, "0");
}

const cariKelas = db.prepare("SELECT id FROM classes WHERE nama_kelas = ?");
const buatKelas = db.prepare("INSERT INTO classes (nama_kelas, jurusan) VALUES (?, ?)");
const cariSiswa = db.prepare(`
    SELECT st.id FROM students st JOIN users u ON u.id = st.user_id
    WHERE u.nama = ? AND st.kelas_id = ?
`);
const buatUser = db.prepare("INSERT INTO users (nama, username, password, role) VALUES (?, ?, ?, 'siswa')");
const buatSiswa = db.prepare(`
    INSERT INTO students (user_id, nis, kelas_id, jenis_kelamin, no_kamar, barcode)
    VALUES (?, ?, ?, ?, ?, ?)
`);
const ubahKamar = db.prepare("UPDATE students SET no_kamar = ?, jenis_kelamin = COALESCE(jenis_kelamin, ?) WHERE id = ?");

const kredensial = [["nama", "kelas", "nis", "username", "password", "no_kamar"]];
let baru = 0, dilewati = 0, kelasBaru = 0;

db.transaction(() => {
    for (const s of data.siswa) {
        let kelas = cariKelas.get(s.kelas);

        if (!kelas) {
            kelas = { id: buatKelas.run(s.kelas, jurusanDari(s.kelas)).lastInsertRowid };
            kelasBaru++;
        }

        const ada = cariSiswa.get(s.nama, kelas.id);

        if (ada) {
            ubahKamar.run(s.kamar, s.jk, ada.id);
            dilewati++;
            continue;
        }

        const nis = nisBerikut();
        const password = passwordAcak();
        const user = buatUser.run(s.nama, nis, bcrypt.hashSync(password, 10));

        buatSiswa.run(user.lastInsertRowid, nis, kelas.id, s.jk, s.kamar, db.buatBarcode());
        kredensial.push([s.nama, s.kelas, nis, nis, password, s.kamar]);
        baru++;
    }
})();

if (baru) {
    const csv = kredensial.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");

    fs.writeFileSync(path.join(__dirname, "akun-siswa-baru.csv"), "﻿" + csv);
}

console.log(`Kelas baru     : ${kelasBaru}`);
console.log(`Siswa baru     : ${baru}`);
console.log(`Sudah ada      : ${dilewati} (nomor kamar diperbarui)`);

if (baru) {
    console.log("\nAkun siswa dibuat dengan NIS sementara + password acak.");
    console.log("Daftar username & password: backend/akun-siswa-baru.csv  (bagikan ke siswa, lalu hapus file itu)");
    console.log("Ganti NIS sementara dengan NIS asli lewat menu Admin > Data Siswa.");
}

db.close();
