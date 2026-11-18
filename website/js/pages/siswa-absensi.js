(async function () {
    const { h, api } = App;
    const page = await App.shell("siswa", "absensi", "Absensi Saya");

    if (!page) return;

    let bulan = Absensi.bulanIni();
    const isi = h("div");
    const bulanInput = h("input", { type: "month", value: bulan, "aria-label": "Bulan" });

    async function muat() {
        try {
            const d = await api("/attendance/saya?bulan=" + bulan);
            const r = d.ringkasan;
            const s = d.siswa;

            const kartu = h("div", { class: "card" },
                h("h3", {}, "Kartu Absensi Digital"),
                h("div", { class: "kartu kartu-besar" },
                    h("header", {}, h("span", { class: "merek" }, h("img", { src: "/icons/icon-192.svg", alt: "" }), h("strong", {}, "SMART SCHOOL")), h("span", {}, "KARTU SISWA")),
                    h("div", { class: "isi" },
                        App.avatar(s.user_id, s.nama, s.has_photo, 72),
                        h("div", { class: "data" }, h("h4", {}, s.nama), h("p", {}, (s.nama_kelas || "Tanpa kelas") + (s.no_kamar ? " · Kamar " + s.no_kamar : "")), h("p", {}, "NIS " + s.nis))),
                    h("div", { class: "kode" }, Code128.svg(s.barcode, { tinggi: 70, lebar: "100%" }), h("small", {}, s.barcode))),
                h("p", { class: "muted", style: "text-align:center;margin-top:10px" },
                    "Tunjukkan barcode ini ke petugas saat masuk sekolah. Jangan dibagikan ke orang lain."));

            const hari = d.tanggal_aktif.slice().reverse().map((t) => ({ tanggal: t, status: d.hari[t] || null }));

            isi.replaceChildren(...[
                kartu,
                r ? App.statGrid([
                    ["Kehadiran", r.persen === null ? "-" : r.persen + "%"],
                    ["Hadir", r.hadir], ["Terlambat", r.terlambat], ["Izin", r.izin], ["Sakit", r.sakit], ["Alpa", r.alpa]
                ]) : null,
                h("div", { class: "card" },
                    h("div", { class: "toolbar" }, h("h3", { style: "margin:0;align-self:center" }, "Riwayat " + Absensi.namaBulan(bulan)), h("div", { class: "grow" }), bulanInput),
                    h("div", { class: "compact" }, App.table([
                        { label: "Tanggal", render: (x) => Absensi.fmtTanggal(x.tanggal) },
                        {
                            label: "Status", render: (x) => x.status ? Absensi.statusBadge(x.status)
                                : (x.tanggal < d.hari_ini ? App.badge("Tidak tercatat (alpa)", "bad") : App.badge("Belum absen", "gray"))
                        }
                    ], hari, "Belum ada hari aktif pada bulan ini.")))].filter(Boolean));
        } catch (e) {
            isi.replaceChildren(h("div", { class: "card" }, h("p", { class: "form-error" }, e.message)));
        }
    }

    bulanInput.addEventListener("change", () => { if (bulanInput.value) { bulan = bulanInput.value; muat(); } });
    page.content.append(App.heading("Absensi Saya", "Kartu barcode dan riwayat kehadiranmu."), isi);
    await muat();
})();
