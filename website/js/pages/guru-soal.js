(async function () {
    const { h, badge } = App;
    const page = await App.shell("guru", "soal", "Soal Tugas");

    if (!page) return;

    const LETTERS = ["A", "B", "C", "D", "E"];
    const content = page.content;
    let assignments = [];

    try {
        assignments = (await App.api("/assignments")).assignments;
    } catch (e) {
        content.append(h("p", { class: "form-error" }, e.message));
        return;
    }

    const wanted = new URLSearchParams(location.search).get("tugas");
    const select = h("select", { class: "grow" },
        h("option", { value: "" }, assignments.length ? "-- Pilih tugas --" : "Belum ada tugas. Buat tugas dulu di menu Tugas Saya."),
        assignments.map((a) => h("option", { value: a.id, selected: String(a.id) === wanted },
            a.judul + " — " + (a.nama_kelas || "-") + " — " + (a.nama_mapel || "-"))));

    const addButton = h("button", { class: "btn-primary", onclick: () => openForm(null), disabled: true }, "+ Tambah Soal");
    const bulkButton = h("button", { class: "btn-ok", onclick: () => openBulk(), disabled: true }, "+ Tambah Banyak Soal");
    const summary = h("div");
    const listBox = h("div", { class: "task-list" });

    content.append(
        App.heading("Soal Tugas",
            "Tambahkan soal pilihan ganda (dinilai otomatis) atau esai (dinilai guru) pada sebuah tugas."),
        h("div", { class: "card" }, h("div", { class: "toolbar" }, select, bulkButton, addButton), summary),
        listBox);

    let questions = [];

    function currentId() { return Number(select.value); }

    function totals() {
        const pg = questions.filter((q) => q.tipe === "pilihan_ganda").length;

        return { pg, esai: questions.length - pg, poin: questions.reduce((s, q) => s + q.bobot, 0) };
    }

    function card(q, index) {
        const body = [
            h("h4", {}, (index + 1) + ". "),
            h("p", { class: "pre" }, q.pertanyaan)
        ];

        if (q.tipe === "pilihan_ganda") {
            body.push(h("div", { style: "margin-top:10px" }, q.opsi.map((opt, i) =>
                h("div", {
                    style: "padding:6px 10px;margin:4px 0;border-radius:6px;background:" + (i === q.jawaban_benar ? "#dcfce7" : "#f8fafc")
                }, LETTERS[i] + ". " + opt, i === q.jawaban_benar ? h("strong", {}, "  ✓ kunci") : null))));
        } else {
            body.push(h("p", { class: "muted", style: "margin-top:8px" }, "Jawaban esai — dinilai manual oleh guru."));
        }

        return h("div", { class: "task" },
            h("div", { style: "flex:1;min-width:240px" }, h("div", { style: "display:flex;gap:8px;align-items:baseline" }, body[0], body[1]), body.slice(2)),
            h("div", { class: "side" },
                badge(q.tipe === "pilihan_ganda" ? "Pilihan ganda" : "Esai", q.tipe === "esai" ? "warn" : ""),
                badge(q.bobot + " poin", "gray"),
                q.jumlah_dijawab ? h("small", { class: "muted" }, q.jumlah_dijawab + " siswa menjawab") : null,
                h("div", { class: "actions" },
                    h("button", { class: "btn-edit btn-sm", onclick: () => openForm(q) }, "Edit"),
                    h("button", { class: "btn-danger btn-sm", onclick: () => remove(q) }, "Hapus"))));
    }

    async function load() {
        addButton.disabled = !select.value;
        bulkButton.disabled = !select.value;
        summary.replaceChildren();

        if (!select.value) {
            listBox.replaceChildren();
            return;
        }

        try {
            questions = (await App.api("/questions?assignment_id=" + currentId())).questions;

            const t = totals();

            summary.append(App.statGrid([
                ["Jumlah Soal", questions.length],
                ["Pilihan Ganda", t.pg],
                ["Esai", t.esai],
                ["Total Poin", t.poin]
            ]));

            if (t.esai === 0 && t.pg > 0) {
                summary.append(h("p", { class: "muted" }, "Semua soal pilihan ganda: nilai siswa dihitung otomatis saat jawaban dikirim."));
            } else if (t.esai > 0) {
                summary.append(h("p", { class: "muted" }, "Ada soal esai: nilai akhir diberikan guru di menu Penilaian (skor pilihan ganda tampil sebagai acuan)."));
            }

            listBox.replaceChildren(...(questions.length
                ? questions.map(card)
                : [h("div", { class: "card" }, h("p", { class: "muted" }, "Belum ada soal untuk tugas ini. Klik “+ Tambah Soal”."))]));
        } catch (e) {
            listBox.replaceChildren(h("p", { class: "form-error" }, e.message));
        }
    }

    // ---------- Tambah banyak soal ----------
    const EXAMPLE = [
        "1. Ibu kota Indonesia adalah...",
        "A. Bandung",
        "B. Jakarta",
        "C. Surabaya",
        "D. Medan",
        "Jawaban: B",
        "",
        "2. Hasil dari 12 x 3 adalah...",
        "A. 26",
        "B. 36",
        "C. 46",
        "Jawaban: B",
        "Bobot: 2",
        "",
        "3. Esai: Jelaskan pengertian fotosintesis!",
        "Bobot: 5"
    ].join("\n");

    // Membaca teks soal. Mengembalikan daftar { q, errors, nomor }.
    function parseText(text) {
        const blocks = [];
        let cur = null;

        const start = (line) => {
            cur = { pertanyaan: line, opsi: {}, kunci: null, bobot: null, esai: false, lines: 1 };
            blocks.push(cur);
        };

        String(text).replace(/\r/g, "").split("\n").forEach((raw) => {
            const line = raw.trim();

            if (!line) return;

            const number = line.match(/^\d+\s*[.)]\s*(.*)$/);
            const option = line.match(/^([A-Ea-e])\s*[.)]\s*(.+)$/);
            const key = line.match(/^(?:jawaban|kunci)(?:\s+benar)?\s*[:=]\s*([A-Ea-e])\b/i);
            const weight = line.match(/^(?:bobot|poin)\s*[:=]\s*(\d+)/i);

            const bareEssay = line.match(/^esai\s*[:.\-]\s*(.*)$/i);

            if (number || bareEssay) {
                const body = number ? number[1] : bareEssay[1];
                const esai = number ? body.match(/^esai\s*[:.\-]\s*(.*)$/i) : bareEssay;

                start(number && esai ? esai[1] : body);
                if (esai) cur.esai = true;
                return;
            }

            if (!cur) return start(line);

            if (key) cur.kunci = key[1].toUpperCase();
            else if (weight) cur.bobot = Number(weight[1]);
            else if (option && !cur.esai) cur.opsi[option[1].toUpperCase()] = option[2].trim();
            else if (Object.keys(cur.opsi).length === 0 && cur.kunci === null) cur.pertanyaan += "\n" + line;
        });

        return blocks.map((b, i) => toQuestion({
            nomor: i + 1, pertanyaan: b.pertanyaan, esai: b.esai || Object.keys(b.opsi).length === 0,
            opsi: b.opsi, kunci: b.kunci, bobot: b.bobot
        }));
    }

    function toQuestion({ nomor, pertanyaan, esai, opsi, kunci, bobot }) {
        const errors = [];
        const q = { tipe: esai ? "esai" : "pilihan_ganda", pertanyaan: String(pertanyaan || "").trim(), bobot: bobot || 1 };

        if (!q.pertanyaan) errors.push("pertanyaan kosong");
        if (q.pertanyaan.length > 1000) errors.push("pertanyaan terlalu panjang");

        if (!esai) {
            const filled = LETTERS.filter((l) => opsi[l]);

            if (filled.length < 2) errors.push("minimal opsi A dan B");
            else if (!kunci) errors.push("belum ada baris “Jawaban: X”");
            else if (!filled.includes(kunci)) errors.push("kunci " + kunci + " tidak ada di opsi");
            else {
                q.opsi = filled.map((l) => opsi[l]);
                q.jawaban_benar = filled.indexOf(kunci);
            }
        }

        if (!Number.isInteger(q.bobot) || q.bobot < 1 || q.bobot > 100) errors.push("bobot harus 1–100");

        return { nomor, q, errors };
    }

    // CSV sederhana (mendukung tanda kutip, koma, atau titik koma sebagai pemisah)
    function parseCsv(text) {
        const clean = String(text).replace(/^﻿/, "");
        const delimiter = (clean.split("\n")[0].match(/;/g) || []).length > (clean.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
        const rows = [];
        let row = [], field = "", quoted = false;

        for (let i = 0; i < clean.length; i++) {
            const c = clean[i];

            if (quoted) {
                if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
                else if (c === '"') quoted = false;
                else field += c;
            } else if (c === '"') quoted = true;
            else if (c === delimiter) { row.push(field); field = ""; }
            else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
            else if (c !== "\r") field += c;
        }

        if (field !== "" || row.length) { row.push(field); rows.push(row); }

        return rows.filter((r) => r.some((x) => x.trim()));
    }

    function parseCsvQuestions(text) {
        const rows = parseCsv(text);

        if (!rows.length) return [];

        const head = rows[0].map((x) => x.trim().toLowerCase());
        const hasHeader = head.includes("pertanyaan");
        const col = (name, fallback) => (hasHeader ? head.indexOf(name) : fallback);
        const idx = {
            tipe: col("tipe", 0), pertanyaan: col("pertanyaan", 1),
            a: col("opsi_a", 2), b: col("opsi_b", 3), c: col("opsi_c", 4), d: col("opsi_d", 5), e: col("opsi_e", 6),
            kunci: col("jawaban", 7), bobot: col("bobot", 8)
        };

        return rows.slice(hasHeader ? 1 : 0).map((r, i) => {
            const get = (k) => (idx[k] >= 0 && r[idx[k]] !== undefined ? r[idx[k]].trim() : "");
            const opsi = {};

            ["a", "b", "c", "d", "e"].forEach((l) => { if (get(l)) opsi[l.toUpperCase()] = get(l); });

            const esai = /^esai/i.test(get("tipe")) || (!get("tipe") && !Object.keys(opsi).length);
            const bobotRaw = get("bobot");

            return toQuestion({
                nomor: i + 1, pertanyaan: get("pertanyaan"), esai, opsi,
                kunci: get("kunci").toUpperCase().slice(0, 1) || null,
                bobot: bobotRaw === "" ? null : Number(bobotRaw)
            });
        });
    }

    function downloadTemplate() {
        const csv = "﻿" + [
            "tipe,pertanyaan,opsi_a,opsi_b,opsi_c,opsi_d,opsi_e,jawaban,bobot",
            'pilihan_ganda,"Ibu kota Indonesia adalah...",Bandung,Jakarta,Surabaya,Medan,,B,1',
            'pilihan_ganda,"Hasil dari 12 x 3 adalah...",26,36,46,,,B,2',
            'esai,"Jelaskan pengertian fotosintesis!",,,,,,,5'
        ].join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");

        link.href = url;
        link.download = "template-soal.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function openBulk() {
        let parsed = [];

        const textarea = h("textarea", {
            placeholder: "Tempel soal di sini...\n\n" + EXAMPLE,
            style: "min-height:260px;font-family:monospace;font-size:13px"
        });
        const fileInput = h("input", { type: "file", accept: ".csv,.txt,text/csv,text/plain" });
        const preview = h("div", { style: "margin-top:14px" });
        const error = h("div", { class: "form-error", role: "alert" });
        const saveBtn = h("button", { class: "btn-primary", disabled: true }, "Simpan Semua Soal");

        function refresh() {
            const bad = parsed.filter((p) => p.errors.length);
            const pg = parsed.filter((p) => !p.errors.length && p.q.tipe === "pilihan_ganda").length;
            const es = parsed.filter((p) => !p.errors.length && p.q.tipe === "esai").length;

            saveBtn.disabled = !parsed.length || bad.length > 0;
            saveBtn.textContent = parsed.length ? "Simpan " + parsed.length + " Soal" : "Simpan Semua Soal";
            error.textContent = "";

            if (!parsed.length) {
                preview.replaceChildren(h("p", { class: "muted" }, "Belum ada soal terbaca."));
                return;
            }

            preview.replaceChildren(
                h("p", {}, "Terbaca: ", badge(pg + " pilihan ganda", "ok"), " ", badge(es + " esai", "warn"), " ",
                    bad.length ? badge(bad.length + " bermasalah", "bad") : null),
                h("div", { style: "max-height:220px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px" },
                    parsed.map((p) => h("div", {
                        style: "padding:8px 12px;border-bottom:1px solid #e2e8f0;background:" + (p.errors.length ? "#fef2f2" : "white")
                    },
                    h("strong", {}, p.nomor + ". "),
                    (p.q.pertanyaan || "(kosong)").slice(0, 110) + (p.q.pertanyaan.length > 110 ? "…" : ""),
                    " ",
                    p.errors.length
                        ? h("span", { style: "color:#b91c1c" }, "— " + p.errors.join(", "))
                        : badge(p.q.tipe === "esai" ? "esai" : "PG · kunci " + LETTERS[p.q.jawaban_benar], "gray")))));
        }

        textarea.addEventListener("input", () => { parsed = parseText(textarea.value); refresh(); });

        fileInput.addEventListener("change", async () => {
            const file = fileInput.files[0];

            if (!file) return;
            if (file.size > 1024 * 1024) return App.toast("Ukuran file maksimal 1 MB", false);

            const text = await file.text();

            if (/\.csv$/i.test(file.name)) {
                parsed = parseCsvQuestions(text);
                textarea.value = "";
            } else {
                textarea.value = text;
                parsed = parseText(text);
            }

            refresh();
        });

        saveBtn.addEventListener("click", async () => {
            saveBtn.disabled = true;

            try {
                const result = await App.api("/questions/bulk", {
                    method: "POST",
                    body: { tugas_id: currentId(), questions: parsed.map((p) => p.q) }
                });

                App.toast(result.message);
                overlay.remove();
                await load();
            } catch (e) {
                error.textContent = e.message;
                saveBtn.disabled = false;
            }
        });

        const overlay = h("div", { class: "overlay" },
            h("div", { class: "modal", style: "max-width:760px" },
                h("h3", {}, "Tambah Banyak Soal"),
                h("p", { class: "muted", style: "margin-bottom:12px" },
                    "Tempel soal dengan format di bawah, atau unggah file CSV (bisa dibuat di Excel). Semua soal dicek dulu sebelum disimpan."),
                h("div", { class: "form-group" }, h("label", {}, "Tempel teks soal"), textarea),
                h("div", { class: "form-group", style: "margin-top:14px" },
                    h("label", {}, "Atau unggah file (.csv / .txt)"), fileInput,
                    h("small", {}, "Di Excel: Simpan Sebagai → CSV. ",
                        h("a", { href: "#", onclick: (e) => { e.preventDefault(); downloadTemplate(); } }, "Unduh template CSV"))),
                preview, error,
                h("div", { class: "form-actions" },
                    h("button", { class: "btn-secondary", onclick: () => overlay.remove() }, "Batal"),
                    saveBtn)));

        overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        textarea.focus();
        refresh();
    }

    function openForm(q) {
        const values = q
            ? {
                tipe: q.tipe, pertanyaan: q.pertanyaan, bobot: q.bobot,
                opsi_a: q.opsi[0], opsi_b: q.opsi[1], opsi_c: q.opsi[2], opsi_d: q.opsi[3], opsi_e: q.opsi[4],
                jawaban_benar: q.jawaban_benar === null ? "" : LETTERS[q.jawaban_benar]
            }
            : { tipe: "pilihan_ganda", bobot: 1 };

        App.formModal({
            title: q ? "Edit Soal" : "Tambah Soal",
            values,
            fields: [
                {
                    name: "tipe", label: "Tipe Soal", type: "select", required: true,
                    options: [{ value: "pilihan_ganda", label: "Pilihan ganda" }, { value: "esai", label: "Esai" }]
                },
                { name: "bobot", label: "Bobot / Poin", type: "number", min: 1, max: 100, required: true },
                { name: "pertanyaan", label: "Pertanyaan", type: "textarea", required: true, maxlength: 1000, full: true },
                { name: "opsi_a", label: "Opsi A", maxlength: 300, hint: "Opsi diisi untuk pilihan ganda (minimal A dan B)." },
                { name: "opsi_b", label: "Opsi B", maxlength: 300 },
                { name: "opsi_c", label: "Opsi C", maxlength: 300 },
                { name: "opsi_d", label: "Opsi D", maxlength: 300 },
                { name: "opsi_e", label: "Opsi E (opsional)", maxlength: 300 },
                {
                    name: "jawaban_benar", label: "Kunci Jawaban", type: "select", placeholder: "Pilih kunci (pilihan ganda)",
                    options: LETTERS.map((l) => ({ value: l, label: "Opsi " + l }))
                }
            ],
            onSubmit: async (data, close) => {
                const payload = { tugas_id: currentId(), tipe: data.tipe, pertanyaan: data.pertanyaan, bobot: data.bobot };

                if (data.tipe === "pilihan_ganda") {
                    const filled = LETTERS.filter((l) => data["opsi_" + l.toLowerCase()]);

                    if (filled.length < 2) throw new Error("Isi minimal opsi A dan B");
                    if (!data.jawaban_benar) throw new Error("Pilih kunci jawaban");
                    if (!filled.includes(data.jawaban_benar)) throw new Error("Kunci jawaban harus pada opsi yang terisi");

                    payload.opsi = filled.map((l) => data["opsi_" + l.toLowerCase()]);
                    payload.jawaban_benar = filled.indexOf(data.jawaban_benar);
                }

                const result = await App.api(q ? "/questions/" + q.id : "/questions", {
                    method: q ? "PUT" : "POST",
                    body: payload
                });

                App.toast(result.message);
                close();
                await load();
            }
        });
    }

    async function remove(q) {
        if (!confirm("Hapus soal ini?")) return;

        try {
            App.toast((await App.api("/questions/" + q.id, { method: "DELETE" })).message);
            await load();
        } catch (e) {
            App.toast(e.message, false);
        }
    }

    select.addEventListener("change", () => {
        history.replaceState(null, "", select.value ? "?tugas=" + select.value : location.pathname);
        load();
    });

    await load();
})();
