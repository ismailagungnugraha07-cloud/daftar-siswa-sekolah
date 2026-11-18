(async function () {
    const { h, badge } = App;
    const page = await App.shell("siswa", "tugas", "Tugas");

    if (!page) return;

    const list = h("div", { class: "task-list" });

    page.content.append(
        App.heading("Daftar Tugas", "Kumpulkan tugas dari guru sebelum batas waktu. Maksimal ukuran file 5 MB."),
        list);

    function submit(task, mine) {
        const editing = Boolean(task.submission_id);

        App.formModal({
            title: (editing ? "Ubah Jawaban: " : "Kumpulkan: ") + task.judul,
            submitText: editing ? "Simpan Perubahan" : "Kumpulkan",
            values: { isi_tugas: mine ? mine.isi_tugas : "" },
            fields: [
                { name: "isi_tugas", label: "Jawaban", type: "textarea", full: true, maxlength: 5000, hint: "Tulis jawaban, atau cukup unggah file." },
                {
                    name: "file", label: "Lampiran (opsional)", type: "file", full: true,
                    accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.jpg,.jpeg,.png,.webp",
                    hint: editing && task.file_tugas ? "Unggah file baru untuk mengganti lampiran sebelumnya." : "PDF, Office, TXT, ZIP, atau gambar."
                }
            ],
            onSubmit: async (data, close) => {
                if (!data.isi_tugas && !data.file && !(editing && task.file_tugas)) {
                    throw new Error("Isi jawaban atau unggah file terlebih dahulu");
                }

                if (data.file && data.file.size > 5 * 1024 * 1024) {
                    throw new Error("Ukuran file maksimal 5 MB");
                }

                const form = new FormData();

                form.append("isi_tugas", data.isi_tugas);

                if (data.file) form.append("file", data.file);
                if (!editing) form.append("tugas_id", task.id);

                const result = await App.api(editing ? "/submissions/" + task.submission_id : "/submissions", {
                    method: editing ? "PUT" : "POST",
                    form
                });

                App.toast(result.message);
                close();
                await load();
            }
        });
    }

    const LETTERS = ["A", "B", "C", "D", "E"];

    async function openQuiz(task) {
        let data;

        try {
            data = await App.api("/questions?assignment_id=" + task.id);
        } catch (e) {
            return App.toast(e.message, false);
        }

        const saved = data.submission ? data.submission.answers : {};
        const error = h("div", { class: "form-error", role: "alert" });
        const submitBtn = h("button", { type: "submit", class: "btn-primary" }, data.submission ? "Simpan Perubahan" : "Kirim Jawaban");

        const blocks = data.questions.map((q, i) => {
            const name = "q_" + q.id;
            let input;

            if (q.tipe === "pilihan_ganda") {
                input = h("div", {}, q.opsi.map((opt, k) =>
                    h("label", { style: "display:flex;gap:10px;align-items:flex-start;padding:8px 10px;margin:4px 0;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-weight:400" },
                        h("input", { type: "radio", name, value: k, checked: saved[q.id] !== undefined && saved[q.id] !== null && Number(saved[q.id]) === k, style: "width:auto;margin-top:3px" }),
                        h("span", {}, LETTERS[k] + ". " + opt))));
            } else {
                input = h("textarea", { name, maxlength: 5000, placeholder: "Tulis jawabanmu..." });
                input.value = saved[q.id] || "";
            }

            return h("div", { class: "form-group", style: "margin:18px 0" },
                h("label", {}, (i + 1) + ". " + q.pertanyaan + " ", badge(q.bobot + " poin", "gray")),
                input);
        });

        const form = h("form", {}, blocks, error,
            h("div", { class: "form-actions" },
                h("button", { type: "button", class: "btn-secondary", onclick: () => overlay.remove() }, "Batal"),
                submitBtn));

        const overlay = h("div", { class: "overlay" },
            h("div", { class: "modal", style: "max-width:720px" }, h("h3", {}, task.judul), form));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            error.textContent = "";
            submitBtn.disabled = true;

            const answers = {};

            data.questions.forEach((q) => {
                const el = form.elements["q_" + q.id];

                if (q.tipe === "pilihan_ganda") {
                    const checked = form.querySelector('input[name="q_' + q.id + '"]:checked');

                    if (checked) answers[q.id] = checked.value;
                } else if (el && el.value.trim()) {
                    answers[q.id] = el.value.trim();
                }
            });

            try {
                const result = await App.api("/questions/submit", { method: "POST", body: { tugas_id: task.id, answers } });

                App.toast(result.nilai !== null && result.nilai !== undefined
                    ? result.message + " — nilai: " + App.fmtNum(result.nilai)
                    : result.message);
                overlay.remove();
                await load();
            } catch (e) {
                error.textContent = e.message;
            } finally {
                submitBtn.disabled = false;
            }
        });

        document.body.appendChild(overlay);
    }

    function card(task, mine) {
        const deadline = App.parseDate(task.batas_waktu);
        const overdue = deadline && deadline.getTime() < Date.now();
        const graded = task.nilai !== null && task.nilai !== undefined;

        let statusBadge;

        if (!task.submission_id) statusBadge = overdue ? badge("Belum dikumpulkan · lewat batas", "bad") : badge("Belum dikumpulkan", "warn");
        else if (task.submission_status === "terlambat") statusBadge = badge("Terkumpul (terlambat)", "warn");
        else statusBadge = badge("Terkumpul", "ok");

        return h("div", { class: "task" },
            h("div", {},
                h("h4", {}, task.judul),
                h("div", { class: "meta" },
                    (task.nama_mapel || "-") + " · Guru: " + (task.guru_nama || "-"),
                    h("br"),
                    "Batas waktu: " + (deadline ? App.fmtDate(task.batas_waktu) : "tanpa batas")),
                task.deskripsi ? h("p", { class: "pre", style: "margin-top:10px" }, task.deskripsi) : null,
                graded && mine && mine.komentar
                    ? h("p", { class: "muted", style: "margin-top:10px" }, "Komentar guru: " + mine.komentar)
                    : null),
            h("div", { class: "side" },
                statusBadge,
                graded ? h("strong", { style: "font-size:22px;color:#173b68" }, "Nilai: " + App.fmtNum(task.nilai)) : null,
                h("div", { class: "actions" },
                    task.file_tugas
                        ? h("button", {
                            class: "btn-edit btn-sm",
                            onclick: () => App.downloadFile(task.file_tugas).catch((e) => App.toast(e.message, false))
                        }, "Lampiran Saya")
                        : null,
                    !graded
                        ? (task.jumlah_soal > 0
                            ? h("button", { class: "btn-primary btn-sm", onclick: () => openQuiz(task) },
                                task.submission_id ? "Ubah Jawaban Soal" : "Kerjakan Soal (" + task.jumlah_soal + ")")
                            : h("button", { class: "btn-primary btn-sm", onclick: () => submit(task, mine) },
                                task.submission_id ? "Ubah Jawaban" : "Kumpulkan"))
                        : null)));
    }

    async function load() {
        try {
            const [tasks, subs, counts] = await Promise.all([
                App.api("/assignments").then((r) => r.assignments),
                App.api("/submissions").then((r) => r.submissions),
                App.api("/questions/counts").then((r) => r.counts)
            ]);

            tasks.forEach((t) => { t.jumlah_soal = counts[t.id] || 0; });
            const byTask = new Map(subs.map((s) => [s.tugas_id, s]));

            list.replaceChildren(...(tasks.length
                ? tasks.map((t) => card(t, byTask.get(t.id)))
                : [h("div", { class: "card" }, h("p", { class: "muted" }, "Belum ada tugas untuk kelasmu."))]));
        } catch (e) {
            list.replaceChildren(h("p", { class: "form-error" }, e.message));
        }
    }

    await load();
})();
