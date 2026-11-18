(async function () {
    const { h, badge } = App;
    const page = await App.shell("siswa", "dashboard", "Dashboard Siswa");

    if (!page) return;

    try {
        const [stats, tasks, grades] = await Promise.all([
            App.api("/auth/stats").then((r) => r.statistics),
            App.api("/assignments").then((r) => r.assignments),
            App.api("/grades").then((r) => r.grades)
        ]);

        const pending = tasks
            .filter((t) => !t.submission_id)
            .sort((a, b) => {
                const da = App.parseDate(a.batas_waktu), db = App.parseDate(b.batas_waktu);

                if (!da) return 1;
                if (!db) return -1;

                return da - db;
            })
            .slice(0, 6);

        page.content.append(
            h("div", { class: "welcome" },
                h("h1", {}, "Halo, " + page.user.nama + "!"),
                h("p", {}, "Kelas: " + stats.className)),
            App.statGrid([
                ["Kelas", stats.className],
                ["Total Tugas", stats.totalAssignments],
                ["Sudah Dikumpulkan", stats.totalSubmitted],
                ["Belum Dikumpulkan", stats.totalPending],
                ["Sudah Dinilai", stats.totalGraded],
                ["Rata-rata Nilai", App.fmtNum(stats.averageGrade)]
            ]),
            h("div", { class: "card" },
                h("h3", {}, "Tugas yang Belum Dikumpulkan"),
                App.table([
                    { label: "Tugas", key: "judul" },
                    { label: "Mapel", key: "nama_mapel" },
                    {
                        label: "Batas Waktu",
                        render: (r) => {
                            const d = App.parseDate(r.batas_waktu);

                            if (!d) return "Tanpa batas";

                            return h("div", {}, App.fmtDate(r.batas_waktu), " ",
                                d.getTime() < Date.now() ? badge("Lewat batas", "bad") : null);
                        }
                    },
                    { label: "", render: () => h("a", { class: "btn btn-primary btn-sm", href: "/siswa/tugas.html" }, "Kerjakan") }
                ], pending, "Semua tugas sudah dikumpulkan. Kerja bagus!")),
            h("div", { class: "card" },
                h("h3", {}, "Nilai Terbaru"),
                App.table([
                    { label: "Tugas", key: "judul" },
                    { label: "Mapel", key: "nama_mapel" },
                    { label: "Nilai", render: (r) => h("strong", {}, App.fmtNum(r.nilai)) },
                    { label: "Komentar Guru", key: "komentar" }
                ], grades.slice(0, 5), "Belum ada nilai.")));
        try {
            // Ringkasan absensi hari ini, diletakkan tepat di bawah sambutan
            const slot = h("div");

            await Absensi.widgetHariIni(slot, page.user);

            const sambutan = page.content.querySelector(".welcome");
            const kartu = [...slot.childNodes];

            if (sambutan) sambutan.after(...kartu);
            else page.content.prepend(...kartu);
        } catch (e) { /* ringkasan absensi bersifat tambahan */ }
    } catch (e) {
        page.content.append(h("p", { class: "form-error" }, e.message));
    }
})();
