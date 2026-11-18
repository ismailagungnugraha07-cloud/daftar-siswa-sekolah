(async function () {
    const { h } = App;
    const page = await App.shell("admin", "dashboard", "Dashboard Admin");

    if (!page) return;

    try {
        const s = (await App.api("/auth/stats")).statistics;

        page.content.append(
            h("div", { class: "welcome" },
                h("h1", {}, "Selamat Datang, " + page.user.nama + "!"),
                h("p", {}, "Kelola seluruh aktivitas sistem informasi sekolah melalui halaman ini.")),
            h("h2", { class: "section-title" }, "Ringkasan Sistem"),
            App.statGrid([
                ["Total Pengguna", s.totalUsers],
                ["Jumlah Siswa", s.totalStudents],
                ["Jumlah Guru", s.totalTeachers],
                ["Jumlah Kelas", s.totalClasses],
                ["Mata Pelajaran", s.totalSubjects],
                ["Total Tugas", s.totalAssignments],
                ["Tugas Terkumpul", s.totalSubmissions],
                ["Tugas Dinilai", s.totalGrades]
            ]),
            h("h2", { class: "section-title" }, "Menu Pengelolaan"),
            h("div", { class: "quick-menu" },
                h("a", { href: "/admin/pengguna.html" }, "+ Tambah Pengguna"),
                h("a", { href: "/admin/siswa.html" }, "Kelola Data Siswa"),
                h("a", { href: "/admin/guru.html" }, "Kelola Data Guru"),
                h("a", { href: "/admin/kelas.html" }, "Kelola Data Kelas"),
                h("a", { href: "/admin/mapel.html" }, "Kelola Mata Pelajaran")));
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
