(async function () {
    const { h, api } = App;
    const role = document.body.dataset.role;
    const page = await App.shell(role, "rekap", "Rekap Absensi");

    if (!page) return;

    const classes = await Absensi.kelasSaya(page.user);

    page.content.append(App.heading("Rekap Absensi", "Kehadiran siswa per bulan. Hari aktif yang sudah lewat tanpa catatan dihitung Alpa."));

    if (!classes.length) return page.content.append(Absensi.pesanTanpaKelas(page.user));

    const bulanInput = h("input", { type: "month", value: Absensi.bulanIni(), "aria-label": "Bulan" });
    const kelasSelect = Absensi.pilihKelas(classes, muat);
    const isi = h("div");
    const unduh = h("button", { class: "btn-ok" }, "⬇ Unduh CSV");
    const cetak = h("button", { class: "btn-secondary", onclick: () => window.print() }, "🖨 Cetak");
    let data = null;

    page.content.append(h("div", { class: "card" },
        h("div", { class: "toolbar no-print" }, kelasSelect, bulanInput, h("div", { class: "grow" }), unduh, cetak), isi));

    function sel(status) {
        if (!status) return h("td", { class: "cell-kosong" }, "·");

        return h("td", { class: "cell-" + status, title: Absensi.STATUS[status].label }, Absensi.STATUS[status].huruf);
    }

    function render() {
        const { siswa, tanggal_aktif } = data;

        if (!tanggal_aktif.length) {
            isi.replaceChildren(h("p", { class: "muted" }, "Belum ada hari aktif pada bulan ini (atau bulan ini belum dimulai)."));
            return;
        }

        const kepala = h("tr", {},
            h("th", {}, "No."), h("th", {}, "Nama"),
            tanggal_aktif.map((t) => h("th", { title: Absensi.fmtTanggal(t) }, Number(t.slice(8)))),
            ["H", "T", "I", "S", "A", "%"].map((t) => h("th", { title: { H: "Hadir", T: "Terlambat", I: "Izin", S: "Sakit", A: "Alpa", "%": "Persentase hadir (H+T)" }[t] }, t)));

        const baris = siswa.map((s, i) => h("tr", {},
            h("td", {}, i + 1),
            h("td", {}, s.nama),
            tanggal_aktif.map((t) => {
                const st = s.hari[t];

                // Tanggal lewat tanpa catatan = alpa otomatis (ditampilkan tapi diberi tanda)
                if (!st && t < App.today()) return h("td", { class: "cell-alpa", title: "Tidak tercatat (dihitung alpa)" }, "A*");

                return sel(st);
            }),
            h("td", {}, s.hadir), h("td", {}, s.terlambat), h("td", {}, s.izin), h("td", {}, s.sakit), h("td", {}, s.alpa),
            h("td", {}, h("strong", {}, s.persen === null ? "-" : s.persen + "%"))));

        isi.replaceChildren(
            h("h3", {}, data.kelas.nama_kelas + " — " + Absensi.namaBulan(data.bulan) + " (" + tanggal_aktif.length + " hari aktif)"),
            h("div", { class: "table-wrap" }, h("table", { class: "matrix" }, h("thead", {}, kepala), h("tbody", {}, baris))),
            h("p", { class: "legend" },
                h("span", {}, "H hadir"), h("span", {}, "T terlambat"), h("span", {}, "I izin"), h("span", {}, "S sakit"),
                h("span", {}, "A alpa"), h("span", {}, "A* tidak tercatat (dihitung alpa)"), h("span", {}, "· belum ada catatan (hari ini)")));
    }

    async function muat() {
        if (!kelasSelect.value || !bulanInput.value) return;

        try {
            data = await api(`/attendance/rekap?kelas_id=${kelasSelect.value}&bulan=${bulanInput.value}`);
            render();
        } catch (e) {
            data = null;
            isi.replaceChildren(h("p", { class: "form-error" }, e.message));
        }
    }

    unduh.addEventListener("click", () => {
        if (!data) return;

        const kepala = ["No", "NIS", "Nama", ...data.tanggal_aktif.map((t) => t.slice(8)), "Hadir", "Terlambat", "Izin", "Sakit", "Alpa", "Persen"];
        const baris = data.siswa.map((s, i) => [
            i + 1, s.nis, s.nama,
            ...data.tanggal_aktif.map((t) => s.hari[t] ? Absensi.STATUS[s.hari[t]].huruf : (t < App.today() ? "A*" : "")),
            s.hadir, s.terlambat, s.izin, s.sakit, s.alpa, s.persen === null ? "" : s.persen
        ]);
        // Awali sel berawalan = + - @ dengan apostrof agar tidak dibaca sebagai rumus Excel
        const aman = (v) => { const t = String(v); return /^[=+\-@]/.test(t) ? "'" + t : t; };
        const csv = [kepala, ...baris].map((r) => r.map((v) => '"' + aman(v).replace(/"/g, '""') + '"').join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
        const a = h("a", { href: url, download: `rekap-absensi-${data.kelas.nama_kelas.replace(/\s+/g, "-")}-${data.bulan}.csv` });

        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    bulanInput.addEventListener("change", muat);
    await muat();
})();
