(async function () {
    const { h, api } = App;
    const role = document.body.dataset.role;
    const admin = role === "admin";
    const page = await App.shell(role, "kalender", admin ? "Kalender & Hari Libur" : "Kalender Sekolah");

    if (!page) return;

    const NAMA_HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
    let bulan = Absensi.bulanIni();
    let data = null;

    const judul = h("h3", {}, "");
    const grid = h("div", { class: "cal-grid" });
    const dari = h("input", { type: "date", id: "f_dari", required: true });
    const sampai = h("input", { type: "date", id: "f_sampai" });
    const jenis = h("select", { id: "f_jenis" }, h("option", { value: "libur" }, "Libur"), h("option", { value: "masuk" }, "Hari masuk khusus (mis. Sabtu pengganti)"));
    const ket = h("input", { type: "text", id: "f_ket", maxlength: 120, placeholder: "Contoh: Libur semester ganjil" });
    const daftar = h("div");

    function geser(n) {
        const d = new Date(bulan + "-01T00:00:00Z");

        d.setUTCMonth(d.getUTCMonth() + n);
        bulan = d.toISOString().slice(0, 7);
        muat();
    }

    function render() {
        judul.textContent = Absensi.namaBulan(bulan);

        const awal = new Date(bulan + "-01T00:00:00Z");
        const offset = (awal.getUTCDay() + 6) % 7; // Senin = 0
        const sel = [];

        for (let i = 0; i < offset; i++) sel.push(h("div", { class: "cal-day kosong" }));

        for (const d of data.days) {
            const kelas = "cal-day " + d.jenis + (d.tanggal === data.hari_ini ? " hari-ini" : "");
            const isi = [h("b", {}, Number(d.tanggal.slice(8))),
                h("small", {}, d.jenis === "libur" || d.jenis === "masuk" ? d.alasan : d.jenis === "akhir_pekan" ? "Libur" : "")];

            sel.push(admin
                ? h("button", {
                    type: "button", class: kelas, title: "Klik untuk mengisi formulir di bawah",
                    onclick: () => { dari.value = d.tanggal; sampai.value = ""; document.getElementById("f_ket").focus(); }
                }, isi)
                : h("div", { class: kelas }, isi));
        }

        grid.replaceChildren(...NAMA_HARI.map((n) => h("div", { class: "cal-dow" }, n.slice(0, 3))), ...sel);
    }

    async function muatDaftar() {
        const r = (await api("/calendar/days")).days;

        if (!admin) return;

        // Gabungkan tanggal berurutan dengan keterangan sama menjadi satu baris
        const grup = [];

        for (const d of r) {
            const akhir = grup[grup.length - 1];
            const berikut = akhir && new Date(new Date(akhir.sampai + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

            if (akhir && akhir.jenis === d.jenis && (akhir.keterangan || "") === (d.keterangan || "") && berikut === d.tanggal) akhir.sampai = d.tanggal;
            else grup.push({ dari: d.tanggal, sampai: d.tanggal, jenis: d.jenis, keterangan: d.keterangan });
        }

        daftar.replaceChildren(App.table([
            { label: "Tanggal", render: (g) => g.dari === g.sampai ? g.dari : g.dari + " s/d " + g.sampai },
            { label: "Jenis", render: (g) => App.badge(g.jenis === "libur" ? "Libur" : "Hari masuk", g.jenis === "libur" ? "bad" : "info") },
            { label: "Keterangan", key: "keterangan" },
            {
                label: "", render: (g) => h("button", {
                    class: "btn-danger btn-sm", onclick: async () => {
                        if (!confirm("Hapus pengecualian ini? Tanggalnya kembali mengikuti jadwal mingguan.")) return;

                        try {
                            for (let t = g.dari; t <= g.sampai; t = new Date(new Date(t + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10)) {
                                await api("/calendar/days/" + t, { method: "DELETE" });
                            }

                            App.toast("Dihapus");
                            muat();
                        } catch (e) { App.toast(e.message, false); }
                    }
                }, "Hapus")
            }
        ], grup, "Belum ada hari libur / hari masuk khusus."));
    }

    async function muat() {
        try {
            data = await api("/calendar?bulan=" + bulan);
            render();

            if (admin) {
                for (const cb of document.querySelectorAll(".week-checks input")) cb.checked = data.pengaturan.hari_aktif.includes(Number(cb.value));

                document.getElementById("f_jam").value = data.pengaturan.jam_masuk;
            }

            await muatDaftar();
        } catch (e) {
            grid.replaceChildren(h("p", { class: "form-error" }, e.message));
        }
    }

    const kalender = h("div", { class: "card" },
        h("div", { class: "cal-head" },
            h("button", { class: "btn-secondary btn-sm", onclick: () => geser(-1), "aria-label": "Bulan sebelumnya" }, "◀"),
            judul,
            h("button", { class: "btn-secondary btn-sm", onclick: () => geser(1), "aria-label": "Bulan berikutnya" }, "▶"),
            h("button", { class: "btn-primary btn-sm", onclick: () => { bulan = Absensi.bulanIni(); muat(); } }, "Bulan ini")),
        grid,
        h("div", { class: "cal-legend" },
            h("span", {}, h("i", { style: "background:#f0fdf4" }), "Hari belajar"),
            h("span", {}, h("i", { style: "background:#fee2e2" }), "Libur"),
            h("span", {}, h("i", { style: "background:#dbeafe" }), "Hari masuk khusus"),
            h("span", {}, h("i", { style: "background:#f1f5f9" }), "Bukan hari belajar"),
            h("span", {}, h("i", { style: "background:#fff;outline:2px solid #2563eb" }), "Hari ini")));

    page.content.append(
        App.heading(admin ? "Kalender & Hari Libur" : "Kalender Sekolah",
            admin ? "Atur hari belajar mingguan, jam masuk, dan tanggal libur. Absensi hanya bisa dicatat pada hari aktif."
                : "Hari belajar dan hari libur sekolah."),
        kalender);

    if (admin) {
        const hariCek = h("div", { class: "week-checks" }, NAMA_HARI.map((n, i) =>
            h("label", {}, h("input", { type: "checkbox", value: i + 1 }), n)));
        const jam = h("input", { type: "time", id: "f_jam", required: true, style: "max-width:160px" });

        page.content.append(
            h("div", { class: "card" },
                h("h3", {}, "Hari Belajar & Jam Masuk"),
                h("form", {
                    onsubmit: async (e) => {
                        e.preventDefault();

                        const aktif = [...hariCek.querySelectorAll("input:checked")].map((c) => Number(c.value));

                        try {
                            const r = await api("/calendar/settings", { method: "PUT", body: { hari_aktif: aktif, jam_masuk: jam.value } });

                            App.toast(r.message);
                            muat();
                        } catch (err) { App.toast(err.message, false); }
                    }
                },
                    h("div", { class: "form-group" }, h("label", {}, "Hari belajar setiap minggu"), hariCek),
                    h("div", { class: "form-group", style: "margin-top:14px" },
                        h("label", { for: "f_jam" }, "Batas jam masuk"), jam,
                        h("small", {}, "Scan sampai jam ini (WIB) dicatat Hadir, setelahnya Terlambat.")),
                    h("div", { class: "form-actions", style: "margin-top:14px" }, h("button", { type: "submit", class: "btn-primary" }, "Simpan Pengaturan")))),
            h("div", { class: "card" },
                h("h3", {}, "Tambah Libur / Hari Masuk Khusus"),
                h("form", {
                    onsubmit: async (e) => {
                        e.preventDefault();

                        try {
                            const r = await api("/calendar/days", {
                                method: "POST",
                                body: { dari: dari.value, sampai: sampai.value || dari.value, jenis: jenis.value, keterangan: ket.value.trim() }
                            });

                            App.toast(r.message);
                            ket.value = "";
                            muat();
                        } catch (err) { App.toast(err.message, false); }
                    }
                },
                    h("div", { class: "form-grid" },
                        h("div", { class: "form-group" }, h("label", { for: "f_dari" }, "Dari tanggal"), dari),
                        h("div", { class: "form-group" }, h("label", { for: "f_sampai" }, "Sampai tanggal (kosongkan bila satu hari)"), sampai),
                        h("div", { class: "form-group" }, h("label", { for: "f_jenis" }, "Jenis"), jenis),
                        h("div", { class: "form-group" }, h("label", { for: "f_ket" }, "Keterangan"), ket)),
                    h("div", { class: "form-actions", style: "margin-top:14px" }, h("button", { type: "submit", class: "btn-primary" }, "Tambahkan")))),
            h("div", { class: "card" }, h("h3", {}, "Daftar Libur & Hari Masuk Khusus"), daftar));
    }

    await muat();
    App.onNewDay(() => muat());
})();
