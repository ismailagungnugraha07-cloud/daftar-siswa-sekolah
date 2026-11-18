(async function () {
    const { h, api } = App;
    const role = document.body.dataset.role;
    const page = await App.shell(role, "absensi", "Absensi Manual");

    if (!page) return;

    const classes = await Absensi.kelasSaya(page.user);

    page.content.append(App.heading("Absensi Manual",
        role === "wali_kelas"
            ? "Isi atau koreksi kehadiran siswa kelasmu: izin, sakit, alpa, atau siswa yang lupa scan."
            : "Isi atau koreksi kehadiran per kelas: izin, sakit, alpa, atau siswa yang lupa scan."));

    if (!classes.length) return page.content.append(Absensi.pesanTanpaKelas(page.user));

    const state = { data: null, pilihan: new Map(), awal: new Map() };
    const tanggalInput = h("input", { type: "date", value: App.today(), max: App.today(), "aria-label": "Tanggal" });
    const kelasSelect = Absensi.pilihKelas(classes, muat);
    const info = h("div");
    const ringkas = h("div", { class: "mini-stats" });
    const isi = h("div");
    const simpan = h("button", { class: "btn-primary" }, "💾 Simpan Perubahan");
    const semuaHadir = h("button", { class: "btn-ok" }, "✔ Tandai yang belum = Hadir");
    const tandaiAlpa = h("button", { class: "btn-danger" }, "Tandai sisanya Alpa");

    page.content.append(h("div", { class: "card" },
        h("div", { class: "toolbar" }, kelasSelect, tanggalInput), info, ringkas, isi,
        h("div", { class: "sticky-bar" }, simpan, semuaHadir, tandaiAlpa,
            h("span", { class: "muted", id: "jumlah-ubah" }, ""))));

    const OPSI = ["hadir", "terlambat", "izin", "sakit", "alpa", "belum"];
    const HURUF = { hadir: "H", terlambat: "T", izin: "I", sakit: "S", alpa: "A", belum: "–" };
    const JUDUL = { hadir: "Hadir", terlambat: "Terlambat", izin: "Izin", sakit: "Sakit", alpa: "Alpa", belum: "Belum absen" };

    function berubah() {
        return state.data.students.filter((s) => {
            const a = state.awal.get(s.id), b = state.pilihan.get(s.id);

            return a.status !== b.status || (a.catatan || "") !== (b.catatan || "");
        });
    }

    function segarkanRingkas() {
        const hit = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0, belum: 0 };

        for (const v of state.pilihan.values()) hit[v.status]++;

        ringkas.replaceChildren(...Object.keys(hit).map((k) =>
            h("span", {}, JUDUL[k] + " ", h("strong", {}, hit[k]))));

        const n = berubah().length;

        document.getElementById("jumlah-ubah").textContent = n ? n + " perubahan belum disimpan" : "";
        simpan.disabled = !n || !state.data.hari_status.aktif;
    }

    function render() {
        const { students, hari_status } = state.data;
        const bisa = hari_status.aktif;

        info.replaceChildren(...[
            h("p", { style: "margin-bottom:10px" }, h("strong", {}, Absensi.fmtTanggal(state.data.tanggal)),
                " ", bisa ? App.badge("Hari aktif", "ok") : App.badge("Libur", "bad")),
            bisa ? null : h("div", { class: "warn-box" }, "Tanggal ini bukan hari aktif (" + hari_status.alasan + "), absensi tidak bisa diisi. Admin dapat mengubahnya di menu Kalender & Libur.")
        ].filter(Boolean));

        semuaHadir.disabled = tandaiAlpa.disabled = !bisa;

        const baris = students.map((s, i) => {
            const v = state.pilihan.get(s.id);
            const radios = OPSI.map((o) => h("label", { title: JUDUL[o] },
                h("input", {
                    type: "radio", name: "st" + s.id, value: o, checked: v.status === o, disabled: !bisa,
                    onchange: () => {
                        v.status = o;
                        tr.classList.toggle("berubah", berubah().some((x) => x.id === s.id));
                        segarkanRingkas();
                    }
                }),
                h("span", { class: "s-" + o }, HURUF[o])));
            const catatan = h("input", {
                class: "note-input", maxlength: 200, placeholder: "Catatan (opsional)", value: v.catatan || "", disabled: !bisa,
                "aria-label": "Catatan " + s.nama,
                oninput: () => { v.catatan = catatan.value; tr.classList.toggle("berubah", berubah().some((x) => x.id === s.id)); segarkanRingkas(); }
            });
            const tr = h("tr", {},
                h("td", {}, i + 1),
                h("td", {}, h("strong", {}, s.nama), h("br"), h("small", { class: "muted" }, "NIS " + s.nis +
                    (s.metode === "scan" ? " · scan " + (s.jam_masuk || "").slice(0, 5) : ""))),
                h("td", {}, h("div", { class: "seg", role: "radiogroup", "aria-label": "Status " + s.nama }, radios)),
                h("td", {}, catatan));

            return tr;
        });

        isi.replaceChildren(h("div", { class: "table-wrap" }, h("table", {},
            h("thead", {}, h("tr", {}, ["No.", "Nama Siswa", "Status (H T I S A –)", "Catatan"].map((t) => h("th", {}, t)))),
            h("tbody", {}, baris.length ? baris : h("tr", {}, h("td", { class: "empty", colspan: 4 }, "Belum ada siswa di kelas ini."))))),
            h("p", { class: "legend" }, "H = Hadir · T = Terlambat · I = Izin · S = Sakit · A = Alpa · – = belum tercatat"));
        segarkanRingkas();
    }

    async function muat() {
        if (!kelasSelect.value) return;

        try {
            const d = await api(`/attendance/kelas?kelas_id=${kelasSelect.value}&tanggal=${tanggalInput.value || App.today()}`);

            state.data = d;
            state.pilihan = new Map(d.students.map((s) => [s.id, { status: s.status || "belum", catatan: s.catatan || "" }]));
            state.awal = new Map(d.students.map((s) => [s.id, { status: s.status || "belum", catatan: s.catatan || "" }]));
            render();
        } catch (e) {
            isi.replaceChildren(h("p", { class: "form-error" }, e.message));
        }
    }

    function adaPerubahan() {
        return state.data && berubah().length;
    }

    async function pindah(fn) {
        if (adaPerubahan() && !confirm("Ada perubahan yang belum disimpan. Lanjutkan tanpa menyimpan?")) return false;

        await fn();

        return true;
    }

    tanggalInput.addEventListener("change", () => {
        if (!tanggalInput.value) tanggalInput.value = App.today();
        muat();
    });

    semuaHadir.addEventListener("click", () => {
        for (const v of state.pilihan.values()) if (v.status === "belum") v.status = "hadir";
        render();
    });

    simpan.addEventListener("click", async () => {
        const items = berubah().map((s) => ({ student_id: s.id, ...state.pilihan.get(s.id) }));

        simpan.disabled = true;

        try {
            const r = await api("/attendance/bulk", {
                method: "POST",
                body: { kelas_id: Number(kelasSelect.value), tanggal: state.data.tanggal, items }
            });

            App.toast(r.message);
            await muat();
        } catch (e) {
            App.toast(e.message, false);
            segarkanRingkas();
        }
    });

    tandaiAlpa.addEventListener("click", async () => {
        const sisa = [...state.pilihan.values()].filter((v) => v.status === "belum").length;

        if (!sisa) return App.toast("Semua siswa sudah tercatat.");

        if (!confirm(`${sisa} siswa yang belum tercatat akan ditandai ALPA untuk ${Absensi.fmtTanggal(state.data.tanggal)}. Lanjutkan?`)) return;

        try {
            // Simpan dulu perubahan di layar supaya tidak hilang
            const items = berubah().map((s) => ({ student_id: s.id, ...state.pilihan.get(s.id) }));

            if (items.length) await api("/attendance/bulk", { method: "POST", body: { kelas_id: Number(kelasSelect.value), tanggal: state.data.tanggal, items } });

            const r = await api("/attendance/tandai-alpa", { method: "POST", body: { kelas_id: Number(kelasSelect.value), tanggal: state.data.tanggal } });

            App.toast(r.message);
            await muat();
        } catch (e) {
            App.toast(e.message, false);
        }
    });

    window.addEventListener("beforeunload", (e) => {
        if (adaPerubahan()) { e.preventDefault(); e.returnValue = ""; }
    });

    App.onNewDay((t) => { tanggalInput.max = t; });

    await muat();
})();
