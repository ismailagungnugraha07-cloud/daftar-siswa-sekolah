/* Menyalin pustaka pemindai kamera (html5-qrcode) ke website/js/vendor agar dipakai
   secara lokal (tanpa CDN). Hanya dibutuhkan untuk browser yang tidak punya
   BarcodeDetector bawaan (iPhone/Safari, Firefox, Chrome di Windows). */
const fs = require("fs");
const path = require("path");

try {
    const asal = require.resolve("html5-qrcode/html5-qrcode.min.js");
    const tujuan = path.join(__dirname, "../website/js/vendor");

    fs.mkdirSync(tujuan, { recursive: true });
    fs.copyFileSync(asal, path.join(tujuan, "html5-qrcode.min.js"));
    console.log("Pemindai kamera cadangan disalin ke website/js/vendor");
} catch (e) {
    console.log("Pemindai kamera cadangan tidak tersedia (tidak masalah, scanner USB & input manual tetap bisa dipakai).");
}
