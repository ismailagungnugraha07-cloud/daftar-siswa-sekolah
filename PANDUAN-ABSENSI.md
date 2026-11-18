# Panduan Fitur Absensi, Kalender & Data Siswa

## 1. Pasang pembaruan
1. Timpa folder lama dengan isi zip ini (database & file `.env` Anda tidak diubah).
2. Di folder `backend`: `npm install` (menyalin pemindai kamera cadangan html5-qrcode ke `website/js/vendor`).
3. Isi data siswa dari Excel: `npm run isi-data`
   - Membuat 10 kelas XI dan 287 siswa (251 putra, 36 putri) beserta nomor kamar.
   - Hasil: `backend/akun-siswa-baru.csv` berisi username & password awal tiap siswa. **Bagikan lalu hapus file itu.**
   - Excel tidak memuat NIS, jadi NIS sementara dibuat otomatis (mis. `26110001`). Ganti dengan NIS asli di Admin > Data Siswa. Kode barcode tidak ikut berubah.
   - Aman dijalankan ulang: siswa yang sudah ada dilewati.
4. `npm start`, buka `http://localhost:3000`, login admin.

Guru/karyawan pada Excel tidak diimpor (hanya data siswa yang diminta).

## 2. Langkah awal admin
- **Kelas**: tetapkan wali kelas tiap kelas (Data Kelas).
- **Kalender & Libur**: cek hari belajar (default Senin–Jumat) dan batas jam masuk (default 07:00); tambahkan libur sekolah. Yang sudah terisi hanya Natal 25-12-2026 dan Tahun Baru 1-1-2027; libur lain tambahkan sendiri.
- **Kartu Siswa**: cetak kartu berbarcode (85,6×54 mm, 10 per A4). Siswa juga bisa menampilkan kartu dari HP di menu *Absensi Saya*.

## 3. Cara absensi
- **Scan** (admin/guru/wali): menu *Scan Absensi*. Tiga cara: kamera, alat scan barcode USB (kolom input selalu aktif), atau ketik kode/NIS lalu Enter. Scan sampai jam masuk = Hadir, setelahnya = Terlambat. Scan ulang tidak menimpa data.
- **Manual** (guru & wali kelas): menu *Absensi Manual* — pilih kelas & tanggal, set H/T/I/S/A, simpan. "Tandai sisanya Alpa" untuk akhir hari. Tanggal lampau bisa dikoreksi.
- Wali kelas hanya mengelola kelasnya; admin & guru semua kelas.
- Absensi hanya bisa dicatat pada **hari aktif** dan tidak untuk tanggal yang belum tiba.
- **Rekap**: per kelas per bulan, bisa unduh CSV / cetak. Hari aktif yang lewat tanpa catatan dihitung Alpa (ditandai A*).
- Jam di pojok atas memakai **waktu server** (WIB), tidak bisa dipalsukan dari HP. Zona waktu lain: set `TZ_SEKOLAH=Asia/Makassar` di `.env`.

## 4. Kamera HP butuh HTTPS
Browser hanya mengizinkan kamera di `https://` atau `localhost`. Lewat WiFi (`http://192.168.x.x:3000`) kamera diblokir. Pilihan:
- **Paling mudah (Chrome Android)**: buka `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, isi `http://192.168.x.x:3000`, Enabled, restart Chrome.
- **HTTPS**: buat sertifikat di `backend/ssl/` lalu restart server (HTTPS aktif otomatis di port 3443):
  `openssl req -x509 -newkey rsa:2048 -nodes -keyout ssl/key.pem -out ssl/cert.pem -days 825 -subj "/CN=sekolah" -addext "subjectAltName=IP:192.168.x.x"`
  (OpenSSL ada di Git for Windows.) Browser akan menampilkan peringatan sertifikat sendiri; pilih lanjutkan.
- Alat scan USB dan input manual tidak butuh HTTPS.
- Chrome Android membaca barcode bawaan; iPhone/Firefox memakai pemindai cadangan dari `npm install`.

## 5. Ringkasan perubahan teknis
- Tabel baru: `settings`, `calendar_days`, `attendance`; kolom baru `students.barcode/jenis_kelamin/no_kamar` (migrasi otomatis saat server start).
- API baru: `/api/calendar/*`, `/api/attendance/*`, `POST /api/students/:id/barcode`.
- Kode barcode acak hanya terlihat admin dan siswa itu sendiri.
- CSP diperbolehkan `blob:` untuk gambar (foto profil).
