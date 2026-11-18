// Membuat APK debug (bisa langsung dipasang di HP). Butuh JDK 21 + Android SDK (Android Studio).
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const androidDir = path.join(root, "android");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(cmd, args, cwd) {
    const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) process.exit(r.status || 1);
}

if (!fs.existsSync(androidDir)) {
    console.error("Folder android/ belum ada. Jalankan dulu: npm run android:init");
    process.exit(1);
}

run("node", [path.join(__dirname, "build-www.js")], root);
run(npx, ["cap", "sync", "android"], root);
run(process.platform === "win32" ? "gradlew.bat" : "./gradlew", ["assembleDebug"], androidDir);

console.log("\nSelesai. APK ada di: mobile/android/app/build/outputs/apk/debug/app-debug.apk");
