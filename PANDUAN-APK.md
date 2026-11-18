# Smart School versi APK (Android)

Aplikasi Android ini **memakai backend dan database yang sama** dengan versi web. Tampilan dibungkus di dalam APK (Capacitor), data diambil dari server sekolah. Jadi akun, absensi, nilai, dan tugas selalu sinkron antara web dan APK. Setiap perubahan di folder `website/` otomatis ikut ke APK saat dibuild ulang.

## 1. Perbarui & jalankan backend
File `backend/server.js` sudah diubah (izin CORS untuk aplikasi + endpoint `/api/ping`). Jalankan ulang backend:

```
cd backend
npm start
```
Catat IPv4 komputer (`ipconfig`), misalnya `192.168.1.10`. HP dan komputer harus satu Wi-Fi.

## 2. Buat APK

### Cara A - GitHub Actions (tanpa install apa pun di komputer)
1. Unggah folder `sekolah-app` ke repository GitHub (jadikan isi `sekolah-app` sebagai root repository; folder `.github/workflows` harus di root).
2. Buka tab **Actions** -> **Build APK Android** -> **Run workflow**.
3. Setelah hijau (sekitar 5-8 menit), unduh artifact **smart-school-apk** -> di dalamnya `app-debug.apk`.

### Cara B - Di komputer sendiri
Butuh Node.js, **JDK 21**, dan Android Studio (untuk Android SDK).
```
cd mobile
npm install
npm run android:init     # sekali saja: membuat proyek android + izin kamera + ikon
npm run apk
```
Hasil: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
Jika Gradle meminta lokasi SDK, buat `mobile/android/local.properties` berisi `sdk.dir=C:\\Users\\NAMA\\AppData\\Local\\Android\\Sdk`.

## 3. Pasang & pakai
1. Kirim `app-debug.apk` ke HP, izinkan "install dari sumber tidak dikenal", lalu pasang.
2. Buka **Smart School**, masukkan alamat server, contoh `192.168.1.10:3000` (port 3000 otomatis bila dikosongkan) -> **Hubungkan**.
3. Login seperti biasa. Alamat server bisa diganti lewat tulisan kecil "Ganti" di bawah halaman login.

## Yang sudah jalan di APK
- Semua menu admin, guru, wali kelas, dan siswa (halaman web yang sama).
- Scan absensi QR/barcode memakai kamera (izin kamera diminta saat pertama dibuka). Tidak perlu HTTPS karena halaman aplikasi sendiri berjalan di konteks aman.
- Unggah tugas/foto profil lewat pemilih file HP.
- Unduh file tugas & CSV: file disimpan sementara lalu muncul menu Bagikan/Simpan.

## Catatan
- APK ini versi *debug* (cukup untuk dipakai dan dibagikan sendiri). Untuk Play Store perlu APK/AAB bertanda tangan (release) - bisa ditambahkan nanti.
- Jika laptop pindah jaringan dan IP berubah, ganti alamat server di aplikasi.
- Perubahan di `website/` -> build ulang APK. Perubahan di `backend/` -> cukup jalankan ulang server, APK tidak perlu dibuild ulang.
