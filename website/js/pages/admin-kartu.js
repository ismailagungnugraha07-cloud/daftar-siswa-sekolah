(async function () {
    const { h, api } = App;
    const page = await App.shell("admin", "kartu", "Kartu Siswa");

    if (!page) return;

    const classes = (await api("/classes")).classes;
    const kelas = h("select", { "aria-label": "Pilih kelas" },
        h("option", { value: "" }, "Semua kelas"),
        classes.map((c) => h("option", { value: c.id }, c.nama_kelas + " (" + c.jumlah_siswa + ")")));
    const cari = h("input", { type: "search", placeholder: "Cari nama atau NIS...", class: "grow" });
    const isi = h("div", { class: "kartu-grid" });
    let siswa = [];

    function kartu(s) {
        return h("div", { class: "kartu" },
            h("header", {}, h("span", { class: "merek" }, h("img", { src: "/icons/icon-192.svg", alt: "" }), h("strong", {}, "SMART SCHOOL")), h("span", {}, "KARTU SISWA")),
            h("div", { class: "isi" },
                App.avatar(s.user_id, s.nama, s.has_photo, 58),
                h("div", { class: "data" }, h("h4", {}, s.nama),
                    h("p", {}, (s.nama_kelas || "Tanpa kelas") + (s.no_kamar ? " · Kamar " + s.no_kamar : "")),
                    h("p", {}, "NIS " + s.nis))),
            h("div", { class: "kode" }, Code128.svg(s.barcode, { tinggi: 52, lebar: "100%" }), h("small", {}, s.barcode)),
            h("div", { class: "aksi no-print" },
                h("button", {
                    class: "btn-secondary btn-sm", onclick: async () => {
                        if (!confirm("Buat ulang barcode untuk " + s.nama + "? Kartu lama tidak berlaku lagi.")) return;

                        try {
                            const r = await api("/students/" + s.id + "/barcode", { method: "POST" });

                            s.barcode = r.barcode;
                            App.toast(r.message);
                            render();
                        } catch (e) { App.toast(e.message, false); }
                    }
                }, "Buat ulang barcode")));
    }

    function render() {
        const kw = cari.value.trim().toLowerCase();
        const daftar = siswa.filter((s) => (!kelas.value || String(s.kelas_id) === kelas.value) &&
            (!kw || s.nama.toLowerCase().includes(kw) || String(s.nis).toLowerCase().includes(kw)));

        isi.replaceChildren(...(daftar.length ? daftar.map(kartu) : [h("p", { class: "muted" }, "Tidak ada siswa.")]));
        jumlah.textContent = daftar.length + " kartu";
    }

    const jumlah = h("span", { class: "muted" }, "");

    page.content.append(
        App.heading("Kartu Siswa", "Cetak kartu berbarcode (ukuran kartu 85,6 × 54 mm, 10 kartu per lembar A4). Tiap siswa punya kode acak yang tidak bisa ditebak dari NIS."),
        h("div", { class: "card" },
            h("div", { class: "toolbar" }, kelas, cari, jumlah,
                h("button", { class: "btn-primary", onclick: () => window.print() }, "🖨 Cetak")),
            isi));

    try {
        const semua = (await api("/students")).students;

        siswa = semua.filter((s) => s.barcode);

        if (semua.length && !siswa.length) {
            isi.replaceChildren(h("p", { class: "form-error" },
                "Data siswa ada, tetapi kode barcode belum terkirim dari server. Tutup server lama (Ctrl+C), jalankan ulang `npm start` di folder backend, lalu muat ulang halaman (Ctrl+F5)."));
            return;
        }

        if (!semua.length) {
            isi.replaceChildren(h("p", { class: "muted" }, "Belum ada data siswa. Jalankan `npm run isi-data` di folder backend atau tambah siswa di menu Data Siswa."));
            return;
        }

        render();
    } catch (e) {
        isi.replaceChildren(h("p", { class: "form-error" }, e.message));
    }

    kelas.addEventListener("change", render);
    cari.addEventListener("input", render);
})();
