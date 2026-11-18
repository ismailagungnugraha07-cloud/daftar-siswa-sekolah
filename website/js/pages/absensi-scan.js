(async function () {
    const { h, api } = App;
    const role = document.body.dataset.role;
    const page = await App.shell(role, "scan", "Scan Absensi");

    if (!page) return;

    const hasil = h("div", { class: "scan-result" }, h("div", {}, "Arahkan barcode kartu siswa ke kamera, atau scan dengan alat USB / ketik kode lalu Enter."));
    const input = h("input", {
        type: "text", autocomplete: "off", autocapitalize: "characters", spellcheck: "false",
        placeholder: "Scan / ketik kode atau NIS, lalu Enter", "aria-label": "Kode barcode atau NIS"
    });
    const ringkas = h("div", { class: "mini-stats" });
    const daftar = h("ul", { class: "recent-list" });
    const video = h("video", { playsinline: true, muted: true, autoplay: true });
    const hint = h("div", { class: "scan-hint" }, "Kamera belum aktif");
    const readerDiv = h("div", { id: "reader-cadangan", style: "width:100%;height:100%;display:none" });
    const box = h("div", { class: "scan-box" }, video, readerDiv, h("div", { class: "scan-frame", hidden: true }), hint);
    const tombolKamera = h("button", { class: "btn-primary" }, "📷 Aktifkan Kamera");
    const tombolStop = h("button", { class: "btn-secondary", hidden: true }, "Matikan Kamera");

    let audioCtx = null;
    let terakhir = { kode: "", waktu: 0 };
    let sibuk = false;

    // ---------- Suara & getar ----------
    function bunyi(jenis) {
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();

            const pola = { ok: [[880, .12]], warn: [[660, .12], [660, .12]], bad: [[220, .35]], info: [[520, .15]] }[jenis] || [[440, .1]];
            let t = audioCtx.currentTime;

            for (const [frek, dur] of pola) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc.frequency.value = frek;
                osc.type = "sine";
                gain.gain.setValueAtTime(.25, t);
                gain.gain.exponentialRampToValueAtTime(.001, t + dur);
                osc.connect(gain).connect(audioCtx.destination);
                osc.start(t);
                osc.stop(t + dur);
                t += dur + .06;
            }

            if (navigator.vibrate) navigator.vibrate(jenis === "bad" ? [200, 80, 200] : 80);
        } catch (e) { /* perangkat tanpa audio */ }
    }

    function tampilHasil(jenis, judul, baris1, baris2) {
        hasil.className = "scan-result " + jenis + " pop";
        hasil.replaceChildren(...[
            h("h2", {}, judul),
            baris1 ? h("div", { class: "kelas" }, baris1) : null,
            baris2 ? h("div", { class: "stat-line" }, baris2) : null
        ].filter(Boolean));
        void hasil.offsetWidth;
        bunyi(jenis);
    }

    // ---------- Proses satu kode ----------
    async function proses(kodeMentah) {
        const kode = String(kodeMentah || "").trim().toUpperCase();

        if (!kode || sibuk) return;

        // Kamera membaca terus-menerus: abaikan kode yang sama dalam 4 detik
        if (kode === terakhir.kode && Date.now() - terakhir.waktu < 4000) return;

        terakhir = { kode, waktu: Date.now() };
        sibuk = true;

        try {
            const r = await fetch("/api/attendance/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + sessionStorage.getItem("token") },
                body: JSON.stringify({ kode })
            });
            const d = await r.json().catch(() => ({}));

            if (r.status === 401) return App.logout();

            const s = d.siswa;
            const info = s ? `${s.kelas || "-"} · NIS ${s.nis}` : "";

            if (d.hasil === "tercatat") {
                const ok = d.absen.status === "hadir";

                tampilHasil(ok ? "ok" : "warn", s.nama, info,
                    (ok ? "✅ HADIR" : "⏰ TERLAMBAT") + " · " + d.absen.jam.slice(0, 5));
            } else if (d.hasil === "sudah_absen") {
                tampilHasil("info", s.nama, info, "Sudah tercatat " + d.absen.status.toUpperCase() +
                    (d.absen.jam ? " · " + d.absen.jam.slice(0, 5) : ""));
            } else {
                tampilHasil("bad", d.hasil === "tidak_dikenal" ? "Kode tidak dikenal" : (s ? s.nama : "Ditolak"), s ? info : kode, d.message || "Gagal");
            }

            muatSamping();
        } catch (e) {
            tampilHasil("bad", "Gagal terhubung", "", e.message);
        } finally {
            sibuk = false;
        }
    }

    async function kirimInput() {
        const kode = input.value;

        input.value = "";
        // Input manual boleh diulang kapan saja
        terakhir = { kode: "", waktu: 0 };
        await proses(kode);
        input.focus();
    }

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            kirimInput();
        }
    });

    // ---------- Ringkasan & daftar terbaru ----------
    async function muatSamping() {
        try {
            const [rg, tb] = await Promise.all([api("/attendance/ringkasan"), api("/attendance/terbaru")]);
            const t = rg.total;

            ringkas.replaceChildren(
                h("span", {}, "Hadir ", h("strong", {}, t.hadir)),
                h("span", {}, "Terlambat ", h("strong", {}, t.terlambat)),
                h("span", {}, "Izin/Sakit ", h("strong", {}, t.izin + t.sakit)),
                h("span", {}, "Belum ", h("strong", {}, t.belum)));

            daftar.replaceChildren(...(tb.absensi.length ? tb.absensi.map((a) =>
                h("li", {},
                    h("div", {}, h("strong", {}, a.nama), h("small", {}, (a.nama_kelas || "-") + " · " + (a.metode === "scan" ? "scan" : "manual"))),
                    h("div", { style: "text-align:right" }, Absensi.statusBadge(a.status),
                        h("small", {}, a.jam_masuk ? a.jam_masuk.slice(0, 5) : "")))) : [h("li", {}, "Belum ada absensi hari ini.")]));
        } catch (e) { /* abaikan */ }
    }

    // ---------- Kamera ----------
    let stream = null;
    let loop = null;
    let cadangan = null;

    async function mulaiKamera() {
        if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            hint.textContent = "Kamera hanya bisa dipakai lewat HTTPS atau localhost. Gunakan alat scan USB / ketik kode, atau aktifkan HTTPS (lihat PANDUAN-ABSENSI.md).";
            return;
        }

        tombolKamera.disabled = true;

        try {
            if ("BarcodeDetector" in window) {
                const didukung = await BarcodeDetector.getSupportedFormats();
                const formats = ["code_128", "qr_code", "code_39", "ean_13"].filter((f) => didukung.includes(f));

                if (formats.length) {
                    const detektor = new BarcodeDetector({ formats });

                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false
                    });
                    video.srcObject = stream;
                    await video.play();
                    hint.hidden = true;
                    box.querySelector(".scan-frame").hidden = false;
                    loop = setInterval(async () => {
                        if (video.readyState < 2 || sibuk) return;

                        try {
                            const kode = await detektor.detect(video);

                            if (kode.length) proses(kode[0].rawValue);
                        } catch (e) { /* frame gagal dibaca */ }
                    }, 250);
                    berhasilAktif();

                    return;
                }
            }

            // Cadangan: pustaka html5-qrcode lokal (iPhone/Safari, Firefox, Chrome Windows)
            await muatPustaka();
            readerDiv.style.display = "block";
            video.style.display = "none";
            hint.hidden = true;
            cadangan = new Html5Qrcode("reader-cadangan");
            await cadangan.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 280, height: 140 } },
                (teks) => proses(teks),
                () => {});
            berhasilAktif();
        } catch (e) {
            hint.hidden = false;
            hint.textContent = e && e.name === "NotAllowedError"
                ? "Izin kamera ditolak. Izinkan kamera di pengaturan browser lalu coba lagi."
                : "Kamera tidak bisa dipakai: " + (e.message || e) + ". Gunakan alat scan USB atau ketik kode.";
            tombolKamera.disabled = false;
        }
    }

    function muatPustaka() {
        if (window.Html5Qrcode) return Promise.resolve();

        return new Promise((resolve, reject) => {
            const s = document.createElement("script");

            s.src = "/js/vendor/html5-qrcode.min.js";
            s.onload = resolve;
            s.onerror = () => reject(new Error("Browser ini belum mendukung scan kamera bawaan. Jalankan 'npm install' di folder backend agar pemindai cadangan tersedia"));
            document.head.append(s);
        });
    }

    function berhasilAktif() {
        tombolKamera.hidden = true;
        tombolStop.hidden = false;
    }

    async function matikanKamera() {
        clearInterval(loop);
        loop = null;

        if (stream) stream.getTracks().forEach((t) => t.stop());
        stream = null;
        video.srcObject = null;

        if (cadangan) {
            try { await cadangan.stop(); cadangan.clear(); } catch (e) { /* abaikan */ }
            cadangan = null;
        }

        readerDiv.style.display = "none";
        video.style.display = "";
        hint.hidden = false;
        hint.textContent = "Kamera dimatikan";
        box.querySelector(".scan-frame").hidden = true;
        tombolKamera.hidden = false;
        tombolKamera.disabled = false;
        tombolStop.hidden = true;
    }

    tombolKamera.addEventListener("click", mulaiKamera);
    tombolStop.addEventListener("click", matikanKamera);
    window.addEventListener("pagehide", matikanKamera);

    // Fokus kembali ke input supaya scanner USB selalu "mengetik" ke kolom ini
    document.addEventListener("click", (e) => {
        if (!e.target.closest("button, select, a, input, textarea")) input.focus();
    });

    page.content.append(
        App.heading("Scan Absensi", "Siswa menunjukkan kartu barcode (cetak atau dari HP) — status Hadir/Terlambat dicatat otomatis sesuai jam masuk."),
        h("div", { id: "info-hari" }),
        h("div", { class: "scan-grid" },
            h("div", { class: "card" },
                h("h3", {}, "Pemindai"),
                box,
                h("div", { class: "actions", style: "margin-top:12px" }, tombolKamera, tombolStop),
                h("div", { class: "scan-input" }, input)),
            h("div", {},
                h("div", { class: "card" }, h("h3", {}, "Hasil Scan"), hasil),
                h("div", { class: "card" }, h("h3", {}, "Hari Ini"), ringkas, daftar))));

    // Peringatan bila hari ini libur
    try {
        const hari = (await api("/calendar/today")).hari_ini;

        if (!hari.aktif) {
            document.getElementById("info-hari").replaceWith(
                h("div", { class: "warn-box" }, "📅 Hari ini bukan hari aktif" + (hari.alasan ? " (" + hari.alasan + ")" : "") + ". Scan ditolak sampai hari aktif berikutnya."));
        }
    } catch (e) { /* abaikan */ }

    App.onNewDay(() => location.reload());
    muatSamping();
    setInterval(muatSamping, 30000);
    input.focus();
})();
