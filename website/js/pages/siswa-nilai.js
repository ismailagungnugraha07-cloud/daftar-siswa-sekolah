(async function () {
    const { h } = App;
    const page = await App.shell("siswa", "nilai", "Nilai Saya");

    if (!page) return;

    try {
        const grades = (await App.api("/grades")).grades;
        const avg = grades.length ? grades.reduce((s, g) => s + Number(g.nilai), 0) / grades.length : null;

        page.content.append(
            App.heading("Nilai Saya", "Nilai dan komentar dari guru untuk tugas yang sudah dinilai."),
            App.statGrid([["Jumlah Nilai", grades.length], ["Rata-rata", App.fmtNum(avg)]]),
            h("div", { class: "card" },
                App.table([
                    { label: "No.", render: (r, i) => i + 1 },
                    { label: "Tugas", key: "judul" },
                    { label: "Mapel", key: "nama_mapel" },
                    { label: "Guru", key: "guru_nama" },
                    { label: "Nilai", render: (r) => h("strong", {}, App.fmtNum(r.nilai)) },
                    { label: "Komentar", key: "komentar" },
                    { label: "Tanggal", render: (r) => App.fmtDate(r.created_at) }
                ], grades, "Belum ada tugasmu yang dinilai.")));
    } catch (e) {
        page.content.append(h("p", { class: "form-error" }, e.message));
    }
})();
