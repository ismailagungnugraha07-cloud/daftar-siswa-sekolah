/* Bagian bersama fitur absensi & kalender. Dimuat setelah app.js */
(function () {
    const { h, api } = App;

    const STATUS = {
        hadir: { label: "Hadir", huruf: "H", kind: "ok" },
        terlambat: { label: "Terlambat", huruf: "T", kind: "warn" },
        izin: { label: "Izin", huruf: "I", kind: "info" },
        sakit: { label: "Sakit", huruf: "S", kind: "info" },
        alpa: { label: "Alpa", huruf: "A", kind: "bad" }
    };

    function statusBadge(status) {
        const s = STATUS[status];

        return s ? App.badge(s.label, s.kind) : App.badge("Belum absen", "gray");
    }

    function bulanIni() {
        return App.today().slice(0, 7);
    }

    function namaBulan(bulan) {
        return new Date(bulan + "-01T00:00:00Z").toLocaleDateString("id-ID", {
            month: "long", year: "numeric", timeZone: "UTC"
        });
    }

    function fmtTanggal(tanggal) {
        return new Date(tanggal + "T00:00:00Z").toLocaleDateString("id-ID", {
            weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
        });
    }

    // Kelas yang boleh dipilih: admin & guru semua kelas, wali kelas hanya kelasnya
    async function kelasSaya(user) {
        const semua = (await api("/classes")).classes;

        return user.role === "wali_kelas" ? semua.filter((c) => c.wali_kelas_id === user.id) : semua;
    }

    function pilihKelas(classes, onChange, opsi = {}) {
        const select = h("select", { "aria-label": "Pilih kelas" },
            classes.length ? null : h("option", { value: "" }, "Belum ada kelas"),
            classes.map((c) => h("option", { value: c.id }, c.nama_kelas + (opsi.jumlah ? ` (${c.jumlah_siswa})` : ""))));

        const simpan = (() => { try { return sessionStorage.getItem("absensi_kelas"); } catch (e) { return null; } })();

        if (simpan && classes.some((c) => String(c.id) === simpan)) select.value = simpan;

        select.addEventListener("change", () => {
            try { sessionStorage.setItem("absensi_kelas", select.value); } catch (e) { /* abaikan */ }
            onChange(select.value);
        });

        return select;
    }

    function pesanTanpaKelas(user) {
        return h("div", { class: "card" }, h("p", { class: "muted" },
            user.role === "wali_kelas"
                ? "Kamu belum ditetapkan sebagai wali kelas. Minta admin mengatur wali kelas di menu Data Kelas."
                : "Belum ada kelas. Admin perlu menambahkan kelas terlebih dahulu."));
    }

    function bar(nilai, total, kind) {
        const persen = total ? Math.round((nilai / total) * 100) : 0;

        return h("div", { class: "progress", title: persen + "%" },
            h("span", { class: kind || "ok", style: `width:${persen}%` }));
    }

    // Kartu ringkasan absensi hari ini untuk dashboard
    async function widgetHariIni(content, user) {
        const data = await api("/attendance/ringkasan");
        const hs = data.hari_status;
        const dasar = user.role === "admin" ? "/admin" : user.role === "guru" ? "/guru" : user.role === "wali_kelas" ? "/wali-kelas" : "/siswa";
        const judul = h("h3", {}, "Absensi Hari Ini");
        const kartu = h("div", { class: "card" }, judul);

        if (!hs.aktif) {
            kartu.append(h("p", { class: "libur-note" }, "📅 Hari ini libur" + (hs.alasan ? ": " + hs.alasan : ".")));
            content.append(kartu);

            return;
        }

        if (user.role === "siswa") {
            kartu.append(
                data.saya
                    ? h("p", {}, "Status kamu hari ini: ", statusBadge(data.saya.status),
                        data.saya.jam ? "  (pukul " + data.saya.jam.slice(0, 5) + ")" : "")
                    : h("p", { class: "muted" }, "Kamu belum tercatat hadir hari ini. Tunjukkan kartu barcode ke petugas."),
                h("a", { class: "btn btn-primary btn-sm", href: dasar + "/absensi.html" }, "Lihat kartu & riwayat absensi"));
            content.append(kartu);

            return;
        }

        const t = data.total;

        kartu.append(
            App.statGrid([
                ["Hadir", t.hadir], ["Terlambat", t.terlambat], ["Izin", t.izin],
                ["Sakit", t.sakit], ["Alpa", t.alpa], ["Belum absen", t.belum]
            ]),
            data.per_kelas.length
                ? App.table([
                    { label: "Kelas", key: "nama_kelas" },
                    { label: "Hadir", render: (r) => r.hadir + r.terlambat + " / " + r.total },
                    { label: "Kehadiran", render: (r) => bar(r.hadir + r.terlambat, r.total) },
                    { label: "Izin/Sakit", render: (r) => r.izin + r.sakit },
                    { label: "Alpa", key: "alpa" },
                    { label: "Belum", key: "belum" }
                ], data.per_kelas)
                : h("p", { class: "muted" }, "Belum ada siswa."),
            h("div", { class: "actions", style: "margin-top:14px" },
                h("a", { class: "btn btn-primary btn-sm", href: dasar + "/scan.html" }, "📷 Scan Absensi"),
                h("a", { class: "btn btn-edit btn-sm", href: dasar + "/absensi.html" }, "✍️ Absensi Manual"),
                h("a", { class: "btn btn-secondary btn-sm", href: dasar + "/rekap.html" }, "📋 Rekap")));

        content.append(kartu);
    }

    window.Absensi = {
        STATUS, statusBadge, bulanIni, namaBulan, fmtTanggal, kelasSaya, pilihKelas,
        pesanTanpaKelas, bar, widgetHariIni
    };
})();
