(async function () {
    const { h, badge } = App;
    const page = await App.shell("guru", "tugas", "Tugas Saya");

    if (!page) return;

    const [classes, subjects] = await Promise.all([
        App.api("/classes").then((r) => r.classes),
        App.api("/subjects").then((r) => r.subjects)
    ]);

    await App.crud(page.content, {
        title: "Tugas Saya",
        itemName: "Tugas",
        description: "Buat tugas untuk kelas dan pantau pengumpulannya.",
        endpoint: "/assignments",
        listKey: "assignments",
        addLabel: "+ Buat Tugas",
        searchPlaceholder: "Cari judul atau mata pelajaran...",
        searchKeys: ["judul", "nama_mapel", "nama_kelas"],
        filters: [{
            key: "kelas_id",
            label: "Semua Kelas",
            options: classes.map((c) => ({ value: c.id, label: c.nama_kelas }))
        }],
        rowLabel: (row) => 'tugas "' + row.judul + '" beserta seluruh pengumpulan & nilainya',
        columns: () => [
            { label: "Judul", render: (r) => h("div", {}, h("strong", {}, r.judul), r.deskripsi ? h("div", { class: "muted pre" }, r.deskripsi) : null) },
            { label: "Mapel", key: "nama_mapel" },
            { label: "Kelas", key: "nama_kelas" },
            {
                label: "Batas Waktu",
                render: (r) => {
                    const d = App.parseDate(r.batas_waktu);

                    if (!d) return "Tanpa batas";

                    return h("div", {}, App.fmtDate(r.batas_waktu), " ",
                        d.getTime() < Date.now() ? badge("Ditutup", "gray") : badge("Terbuka", "ok"));
                }
            },
            { label: "Terkumpul", render: (r) => r.jumlah_pengumpulan + " / " + r.jumlah_siswa }
        ],
        extraActions: (row) => [
            h("a", { class: "btn btn-edit btn-sm", href: "/guru/soal.html?tugas=" + row.id }, "Soal"),
            h("a", { class: "btn btn-ok btn-sm", href: "/guru/penilaian.html?tugas=" + row.id }, "Nilai")
        ],
        formValues: (item) => item
            ? { ...item, batas_waktu: item.batas_waktu ? String(item.batas_waktu).replace(" ", "T").slice(0, 16) : "" }
            : {},
        fields: () => [
            { name: "judul", label: "Judul Tugas", required: true, maxlength: 150, full: true },
            {
                name: "subject_id", label: "Mata Pelajaran", type: "select", required: true,
                options: subjects.map((s) => ({ value: s.id, label: s.nama_mapel }))
            },
            {
                name: "kelas_id", label: "Kelas", type: "select", required: true,
                options: classes.map((c) => ({ value: c.id, label: c.nama_kelas }))
            },
            { name: "batas_waktu", label: "Batas Waktu", type: "datetime-local", full: true, hint: "Kosongkan jika tanpa batas waktu." },
            { name: "deskripsi", label: "Deskripsi / Petunjuk", type: "textarea", full: true, maxlength: 2000 }
        ]
    });
})();
