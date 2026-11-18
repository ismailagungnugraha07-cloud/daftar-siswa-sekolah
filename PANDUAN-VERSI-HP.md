# Smart School versi HP

Versi HP menggunakan website responsif + PWA. Backend Node.js dan database SQLite tetap berjalan di komputer/laptop seperti sebelumnya.

## Data siswa
File `backend/data/siswa-kamar.json` sudah berisi data siswa hasil olahan daftar pembagian kamar. Untuk memasukkannya ke database:
1. Buka PowerShell di folder `sekolah-app/backend`.
2. Jalankan `npm install` jika dependensi belum terpasang.
3. Jalankan `npm run isi-data`.
4. Catat hasil jumlah kelas/siswa baru dan simpan file `akun-siswa-baru.csv` dengan aman. File itu berisi username dan password awal siswa; bagikan secara pribadi, lalu hapus file tersebut setelah dibutuhkan.
5. Jalankan server dengan `npm start`.

Impor aman dijalankan ulang: siswa yang sudah ada akan dilewati dan nomor kamar diperbarui. NIS yang dibuat otomatis adalah NIS sementara; admin perlu menggantinya dengan NIS resmi bila tersedia.

## Membuka dari HP
1. Hubungkan HP dan laptop ke Wi-Fi yang sama.
2. Jalankan backend di laptop.
3. Cari alamat IPv4 laptop dengan `ipconfig`.
4. Di Chrome HP buka `http://IP-LAPTOP:3000` (ganti IP-LAPTOP dengan alamat IPv4 laptop).
5. Login memakai akun yang sudah dibuat admin.
6. Untuk memasang PWA dengan ikon aplikasi dan mode layar penuh, gunakan alamat HTTPS yang valid; service worker hanya aktif pada HTTPS atau localhost. Jika server LAN masih HTTP, website tetap bisa dibuka dan tampil responsif di Chrome, tetapi pemasangan PWA mungkin tidak ditawarkan.

## Catatan
Data API, sesi login, dan berkas tugas tidak disimpan oleh service worker. Aplikasi HP tetap terhubung ke backend laptop, jadi laptop dan jaringan Wi-Fi harus aktif.
