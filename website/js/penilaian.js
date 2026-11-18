/* Halaman pengumpulan & penilaian tugas.
   Dipakai guru (canGrade = true) dan wali kelas (hanya melihat). */
async function initPenilaian({ role, active, title, canGrade }) {
    const { h, badge } = App;
    const page = await App.shell(role, active, title);

    if (!page) return;

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
        h("option", { value: "" }, assignments.length ? "-- Pilih tugas --" : "Belum ada tugas"),
        assignments.map((a) => h("option", {
            value: a.id,
            selected: String(a.id) === wanted
        }, a.judul + " — " + (a.nama_kelas || "-") + " — " + (a.nama_mapel || "-"))));

    const info = h("div");
    const tableBox = h("div");

    content.append(
        App.heading(title, canGrade
            ? "Lihat jawaban siswa, lalu beri nilai (0–100) dan komentar."
            : "Pantau pengumpulan tugas dan nilai siswa di kelas yang kamu ampu."),
        h("div", { class: "card" }, h("div", { class: "toolbar" }, select), info),
        h("div", { class: "card" }, tableBox));

    const LETTERS = ["A", "B", "C", "D", "E"];

    function questionBlock(q, index) {
        const body = [h("strong", {}, (index + 1) + ". " + q.pertanyaan + " "), badge(q.bobot + " poin", "gray")];

        if (q.tipe === "pilihan_ganda") {
            const chosen = q.jawaban === null || q.jawaban === undefined ? null : Number(q.jawaban);

            body.push(h("div", { style: "margin-top:8px" }, q.opsi.map((opt, i) => {
                const isKey = q.jawaban_benar === i;
                const isChosen = chosen === i;

                return h("div", {
                    style: "padding:6px 10px;margin:4px 0;border-radius:6px;" +
                        (isKey ? "background:#dcfce7;" : isChosen ? "background:#fee2e2;" : "background:#f8fafc;")
                }, LETTERS[i] + ". " + opt,
                isChosen ? h("strong", {}, "  ← jawaban siswa") : null,
                isKey ? h("strong", {}, "  ✓ kunci") : null);
            })));

            if (chosen === null) body.push(h("p", { class: "muted" }, "Tidak dijawab"));
        } else {
            body.push(h("p", { class: "pre", style: "margin-top:8px;padding:10px;background:#f8fafc;border-radius:6px" },
                q.jawaban || "(tidak dijawab)"));
        }

        return h("div", { style: "margin:14px 0" }, body);
    }

    async function showAnswer(row) {
        const parts = [];

        parts.push(h("p", { class: "muted" }, "Dikumpulkan: " + App.fmtDate(row.created_at)));

        let quiz = null;

        try {
            quiz = await App.api("/questions/answers?submission_id=" + row.submission_id);
        } catch (e) { /* tugas tanpa soal */ }

        if (quiz && quiz.questions.length) {
            if (quiz.skor_pg !== null) {
                parts.push(h("p", { style: "margin:10px 0" }, "Skor pilihan ganda: ", h("strong", {}, App.fmtNum(quiz.skor_pg))));
            }

            quiz.questions.forEach((q, i) => parts.push(questionBlock(q, i)));
        }

        if (row.isi_tugas || !(quiz && quiz.questions.length)) {
            parts.push(row.isi_tugas
                ? h("p", { class: "pre", style: "margin:12px 0" }, row.isi_tugas)
                : h("p", { class: "muted", style: "margin:12px 0" }, "Tidak ada jawaban teks."));
        }

        if (row.file_tugas) {
            parts.push(h("button", {
                class: "btn-edit",
                onclick: () => App.downloadFile(row.file_tugas).catch((e) => App.toast(e.message, false))
            }, "Unduh Lampiran"));
        }

        App.viewModal("Jawaban " + row.nama, parts);
    }

    function statusBadge(row) {
        if (!row.submission_id) return badge("Belum mengumpulkan", "bad");

        return row.status === "terlambat" ? badge("Terlambat", "warn") : badge("Terkirim", "ok");
    }

    function gradeCell(row, reload) {
        if (!canGrade) {
            return row.grade_id ? h("strong", {}, App.fmtNum(row.nilai)) : "-";
        }

        if (!row.submission_id) return h("span", { class: "muted" }, "-");

        const nilai = h("input", {
            type: "number", min: 0, max: 100, step: "0.01",
            value: row.nilai ?? "", style: "width:90px;padding:8px;border:1px solid #cbd5e1;border-radius:6px",
            "aria-label": "Nilai " + row.nama
        });
        const komentar = h("input", {
            type: "text", maxlength: 300, placeholder: "Komentar (opsional)",
            value: row.komentar ?? "", style: "width:200px;padding:8px;border:1px solid #cbd5e1;border-radius:6px",
            "aria-label": "Komentar " + row.nama
        });

        const save = h("button", {
            class: "btn-primary btn-sm",
            onclick: async () => {
                if (nilai.value === "") return App.toast("Isi nilai terlebih dahulu", false);

                save.disabled = true;

                try {
                    const result = await App.api("/grades", {
                        method: "POST",
                        body: { submission_id: row.submission_id, nilai: nilai.value, komentar: komentar.value }
                    });

                    App.toast(result.message);
                    await reload();
                } catch (e) {
                    App.toast(e.message, false);
                    save.disabled = false;
                }
            }
        }, row.grade_id ? "Ubah" : "Simpan");

        const wrap = h("div", { class: "actions" }, nilai, komentar, save);

        if (row.grade_id) {
            wrap.append(h("button", {
                class: "btn-danger btn-sm",
                onclick: async () => {
                    if (!confirm("Hapus nilai " + row.nama + "?")) return;

                    try {
                        await App.api("/grades/" + row.grade_id, { method: "DELETE" });
                        App.toast("Nilai dihapus");
                        await reload();
                    } catch (e) {
                        App.toast(e.message, false);
                    }
                }
            }, "Hapus"));
        }

        return wrap;
    }

    async function load() {
        info.replaceChildren();

        if (!select.value) {
            tableBox.replaceChildren(h("p", { class: "muted" }, "Pilih tugas untuk melihat pengumpulan."));
            return;
        }

        try {
            const result = await App.api("/submissions?assignment_id=" + encodeURIComponent(select.value));
            const a = result.assignment;
            const s = result.statistics;
            const graded = result.students.filter((r) => r.grade_id);
            const avg = graded.length
                ? graded.reduce((sum, r) => sum + Number(r.nilai), 0) / graded.length
                : null;

            info.append(
                h("p", { class: "muted", style: "margin-bottom:14px" },
                    (a.nama_mapel || "-") + " · " + (a.nama_kelas || "-") + " · Batas: " + (a.batas_waktu ? App.fmtDate(a.batas_waktu) : "tanpa batas")),
                App.statGrid([
                    ["Jumlah Siswa", s.totalStudents],
                    ["Sudah Mengumpulkan", s.submitted],
                    ["Belum Mengumpulkan", s.notSubmitted],
                    ["Sudah Dinilai", s.graded],
                    ["Rata-rata Nilai", App.fmtNum(avg)]
                ]));

            tableBox.replaceChildren(App.table([
                { label: "No.", render: (r, i) => i + 1 },
                { label: "NIS", key: "nis" },
                { label: "Nama", key: "nama" },
                { label: "Status", render: statusBadge },
                { label: "Dikumpulkan", render: (r) => r.submission_id ? App.fmtDate(r.created_at) : "-" },
                {
                    label: "Jawaban",
                    render: (r) => r.submission_id
                        ? h("button", { class: "btn-edit btn-sm", onclick: () => showAnswer(r) }, "Lihat")
                        : "-"
                },
                { label: canGrade ? "Nilai & Komentar" : "Nilai", render: (r) => gradeCell(r, load) },
                ...(canGrade ? [] : [{ label: "Komentar", key: "komentar" }])
            ], result.students, "Belum ada siswa di kelas ini."));
        } catch (e) {
            tableBox.replaceChildren(h("p", { class: "form-error" }, e.message));
        }
    }

    select.addEventListener("change", () => {
        history.replaceState(null, "", select.value ? "?tugas=" + select.value : location.pathname);
        load();
    });

    await load();
}
