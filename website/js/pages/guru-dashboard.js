(async function () {
    const { h, badge } = App;
    const page = await App.shell("guru", "dashboard", "Dashboard Guru");

    if (!page) return;

    try {
        const [stats, subs, tasks] = await Promise.all([
            App.api("/auth/stats").then((r) => r.statistics),
            App.api("/submissions").then((r) => r.submissions),
            App.api("/assignments").then((r) => r.assignments)
        ]);

        const ungraded = subs.filter((s) => !s.grade_id).slice(0, 8);

        page.content.append(
            h("div", { class: "welcome" },
                h("h1", {}, "Selamat Datang, " + page.user.nama + "!"),
                h("p", {}, "Buat tugas, pantau pengumpulan, dan beri nilai siswa dari sini.")),
            App.statGrid([
                ["Tugas Dibuat", stats.totalAssignments],
                ["Jumlah Siswa", stats.totalStudents],
                ["Tugas Terkumpul", stats.totalSubmissions],
                ["Menunggu Dinilai", stats.totalUngraded],
                ["Sudah Dinilai", stats.totalGraded]
            ]),
            h("div", { class: "card" },
                h("h3", {}, "Perlu Dinilai"),
                App.table([
                    { label: "Siswa", key: "siswa_nama" },
                    { label: "Tugas", key: "judul" },
                    { label: "Kelas", key: "nama_kelas" },
                    { label: "Status", render: (r) => badge(r.status, r.status === "terlambat" ? "warn" : "ok") },
                    { label: "Dikumpulkan", render: (r) => App.fmtDate(r.created_at) },
                    { label: "", render: (r) => h("a", { class: "btn btn-ok btn-sm", href: "/guru/penilaian.html?tugas=" + r.tugas_id }, "Nilai") }
                ], ungraded, "Semua pengumpulan sudah dinilai.")),
            h("div", { class: "card" },
                h("h3", {}, "Tugas Terbaru"),
                App.table([
                    { label: "Judul", key: "judul" },
                    { label: "Kelas", key: "nama_kelas" },
                    { label: "Mapel", key: "nama_mapel" },
                    { label: "Batas Waktu", render: (r) => r.batas_waktu ? App.fmtDate(r.batas_waktu) : "Tanpa batas" },
                    { label: "Terkumpul", render: (r) => r.jumlah_pengumpulan + " / " + r.jumlah_siswa }
                ], tasks.slice(0, 5), "Belum ada tugas. Buat tugas pertamamu di menu Tugas Saya.")),
            h("div", { class: "quick-menu" },
                h("a", { href: "/guru/tugas.html" }, "+ Buat / Kelola Tugas"),
                h("a", { href: "/guru/penilaian.html" }, "Penilaian Siswa")));
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
