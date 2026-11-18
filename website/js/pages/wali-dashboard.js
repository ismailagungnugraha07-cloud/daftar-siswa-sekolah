(async function () {
    const { h } = App;
    const page = await App.shell("wali_kelas", "dashboard", "Dashboard Wali Kelas");

    if (!page) return;

    try {
        const [stats, students, grades] = await Promise.all([
            App.api("/auth/stats").then((r) => r.statistics),
            App.api("/students").then((r) => r.students),
            App.api("/grades").then((r) => r.grades)
        ]);

        const rows = students.map((s) => {
            const own = grades.filter((g) => g.student_id === s.id);
            const avg = own.length ? own.reduce((sum, g) => sum + Number(g.nilai), 0) / own.length : null;

            return { ...s, jumlah_nilai: own.length, rata_rata: avg };
        });

        page.content.append(
            h("div", { class: "welcome" },
                h("h1", {}, "Selamat Datang, " + page.user.nama + "!"),
                h("p", {}, "Kelas yang kamu ampu: " + stats.className)),
            App.statGrid([
                ["Kelas", stats.className],
                ["Jumlah Siswa", stats.totalStudents],
                ["Total Tugas Kelas", stats.totalAssignments],
                ["Tugas Terkumpul", stats.totalSubmissions],
                ["Rata-rata Nilai", App.fmtNum(stats.averageGrade)]
            ]),
            h("div", { class: "card" },
                h("h3", {}, "Ringkasan Nilai per Siswa"),
                App.table([
                    { label: "No.", render: (r, i) => i + 1 },
                    { label: "NIS", key: "nis" },
                    { label: "Nama", key: "nama" },
                    { label: "Tugas Dinilai", key: "jumlah_nilai" },
                    { label: "Rata-rata", render: (r) => App.fmtNum(r.rata_rata) }
                ], rows, "Belum ada siswa di kelasmu. Hubungi admin untuk mengatur wali kelas dan siswa.")),
            h("div", { class: "quick-menu" },
                h("a", { href: "/wali-kelas/siswa.html" }, "Daftar Siswa Kelas"),
                h("a", { href: "/wali-kelas/tugas.html" }, "Tugas & Nilai Kelas")));
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
