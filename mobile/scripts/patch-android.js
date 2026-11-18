// Dijalankan sekali setelah "npx cap add android": izin kamera, HTTP lokal, dan ikon.
const fs = require("fs");
const path = require("path");

const androidDir = path.join(__dirname, "..", "android");
const manifestPath = path.join(androidDir, "app", "src", "main", "AndroidManifest.xml");

if (!fs.existsSync(manifestPath)) {
    console.error("android/ belum ada. Jalankan: npm run android:init");
    process.exit(1);
}

let xml = fs.readFileSync(manifestPath, "utf8");

if (!xml.includes("android.permission.CAMERA")) {
    xml = xml.replace(
        "<application",
        '<uses-permission android:name="android.permission.CAMERA" />\n' +
        '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n' +
        '    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />\n\n' +
        "    <application"
    );
}

// Server sekolah umumnya HTTP di jaringan lokal
if (!xml.includes("usesCleartextTraffic")) {
    xml = xml.replace("<application", '<application\n        android:usesCleartextTraffic="true"');
}

// Layar tetap portrait
if (!xml.includes("screenOrientation")) {
    xml = xml.replace("<activity", '<activity\n            android:screenOrientation="portrait"');
}

fs.writeFileSync(manifestPath, xml);

// Ikon aplikasi dari ikon website
const icon = path.join(__dirname, "..", "..", "website", "icons", "icon-192.png");
const res = path.join(androidDir, "app", "src", "main", "res");

fs.rmSync(path.join(res, "mipmap-anydpi-v26"), { recursive: true, force: true });

for (const dir of fs.readdirSync(res).filter((d) => d.startsWith("mipmap-"))) {
    for (const name of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
        fs.copyFileSync(icon, path.join(res, dir, name));
    }
}

console.log("Android dipatch: izin kamera, HTTP lokal, portrait, ikon.");
