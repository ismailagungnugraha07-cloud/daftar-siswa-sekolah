// Menyalin ../website ke ./www lalu menyesuaikannya untuk dipakai di dalam aplikasi Android.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const website = path.join(root, "..", "website");
const www = path.join(root, "www");

if (!fs.existsSync(website)) {
    console.error("Folder website tidak ditemukan: " + website);
    process.exit(1);
}

fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(website, www, { recursive: true });

// Service worker tidak dipakai di aplikasi (aset sudah ada di dalam APK).
fs.rmSync(path.join(www, "service-worker.js"), { force: true });

const appJs = path.join(www, "js", "app.js");
let js = fs.readFileSync(appJs, "utf8");
const swCheck = '"serviceWorker" in navigator && window.isSecureContext';

if (!js.includes(swCheck)) {
    console.error("Pola pendaftaran service worker di js/app.js tidak ditemukan. Perbarui scripts/build-www.js.");
    process.exit(1);
}

fs.writeFileSync(appJs, js.replace(swCheck, "false"));

// File khusus aplikasi
fs.copyFileSync(path.join(root, "src", "mobile-bridge.js"), path.join(www, "mobile-bridge.js"));
fs.copyFileSync(path.join(root, "src", "server.html"), path.join(www, "server.html"));

// Sisipkan jembatan paling awal di <head> semua halaman HTML
let jumlah = 0;

(function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith(".html") || entry.name === "server.html") continue;

        const html = fs.readFileSync(full, "utf8");

        if (!/<head>/i.test(html)) {
            console.error("Tidak ada <head> di " + full);
            process.exit(1);
        }

        fs.writeFileSync(
            full,
            html
                .replace(/<head>/i, '<head>\n    <script src="/mobile-bridge.js"></script>')
                .split(swCheck).join("false")
        );
        jumlah++;
    }
})(www);

console.log("www siap: " + jumlah + " halaman HTML disesuaikan.");
