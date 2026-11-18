/* Library bersama Smart School.
   Semua render memakai DOM API (textContent) sehingga aman dari XSS. */
(function () {
    // Dukungan instalasi ke layar utama HP (PWA).
    if (!document.querySelector('link[rel="manifest"]')) {
        const manifest = document.createElement("link");
        manifest.rel = "manifest";
        manifest.href = "/manifest.webmanifest";
        document.head.appendChild(manifest);
    }
    if ("serviceWorker" in navigator && window.isSecureContext) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("/service-worker.js").catch((error) => {
                console.warn("Service worker tidak dapat didaftarkan:", error);
            });
        });
    }

    const token = sessionStorage.getItem("token");
    let storedUser = null;

    try {
        storedUser = JSON.parse(sessionStorage.getItem("user"));
    } catch (e) { /* abaikan */ }

    const ROLE_NAMES = {
        admin: "Administrator",
        guru: "Guru",
        wali_kelas: "Wali Kelas",
        siswa: "Siswa"
    };

    const HOME = {
        admin: "/admin/dashboard.html",
        guru: "/guru/dashboard.html",
        wali_kelas: "/wali-kelas/dashboard.html",
        siswa: "/siswa/dashboard.html"
    };

    const MENUS = {
        admin: [
            ["dashboard", "🏠 Dashboard", "/admin/dashboard.html"],
            ["pengguna", "👥 Data Pengguna", "/admin/pengguna.html"],
            ["siswa", "🎓 Data Siswa", "/admin/siswa.html"],
            ["guru", "👩‍🏫 Data Guru", "/admin/guru.html"],
            ["kelas", "🏫 Data Kelas", "/admin/kelas.html"],
            ["mapel", "📚 Mata Pelajaran", "/admin/mapel.html"],
            ["scan", "📷 Scan Absensi", "/admin/scan.html"],
            ["absensi", "✍️ Absensi Manual", "/admin/absensi.html"],
            ["rekap", "📋 Rekap Absensi", "/admin/rekap.html"],
            ["kalender", "📅 Kalender & Libur", "/admin/kalender.html"],
            ["kartu", "🪪 Kartu Siswa", "/admin/kartu.html"],
            ["profil", "👤 Profil Saya", "/admin/profil.html"]
        ],
        guru: [
            ["dashboard", "🏠 Dashboard", "/guru/dashboard.html"],
            ["tugas", "📝 Tugas Saya", "/guru/tugas.html"],
            ["soal", "❓ Soal", "/guru/soal.html"],
            ["penilaian", "✅ Penilaian", "/guru/penilaian.html"],
            ["scan", "📷 Scan Absensi", "/guru/scan.html"],
            ["absensi", "✍️ Absensi Manual", "/guru/absensi.html"],
            ["rekap", "📋 Rekap Absensi", "/guru/rekap.html"],
            ["kalender", "📅 Kalender", "/guru/kalender.html"],
            ["profil", "👤 Profil Saya", "/guru/profil.html"]
        ],
        wali_kelas: [
            ["dashboard", "🏠 Dashboard", "/wali-kelas/dashboard.html"],
            ["siswa", "🎓 Siswa Kelas", "/wali-kelas/siswa.html"],
            ["tugas", "📊 Tugas & Nilai", "/wali-kelas/tugas.html"],
            ["scan", "📷 Scan Absensi", "/wali-kelas/scan.html"],
            ["absensi", "✍️ Absensi Manual", "/wali-kelas/absensi.html"],
            ["rekap", "📋 Rekap Absensi", "/wali-kelas/rekap.html"],
            ["kalender", "📅 Kalender", "/wali-kelas/kalender.html"],
            ["profil", "👤 Profil Saya", "/wali-kelas/profil.html"]
        ],
        siswa: [
            ["dashboard", "🏠 Dashboard", "/siswa/dashboard.html"],
            ["tugas", "📝 Tugas", "/siswa/tugas.html"],
            ["nilai", "⭐ Nilai Saya", "/siswa/nilai.html"],
            ["absensi", "🪪 Absensi Saya", "/siswa/absensi.html"],
            ["kalender", "📅 Kalender", "/siswa/kalender.html"],
            ["profil", "👤 Profil Saya", "/siswa/profil.html"]
        ]
    };

    function logout() {
        sessionStorage.clear();
        window.location.href = "/login.html";
    }

    // ---------- DOM helper ----------
    function h(tag, attrs, ...children) {
        const el = document.createElement(tag);

        for (const [key, value] of Object.entries(attrs || {})) {
            if (value === null || value === undefined || value === false) continue;

            if (key === "class") el.className = value;
            else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
            else if (key === "value") el.value = value;
            else if (value === true) el.setAttribute(key, "");
            else el.setAttribute(key, value);
        }

        (function add(list) {
            list.forEach((child) => {
                if (Array.isArray(child)) return add(child);
                if (child === null || child === undefined || child === false) return;
                el.append(child instanceof Node ? child : document.createTextNode(String(child)));
            });
        })(children);

        return el;
    }

    // ---------- API ----------
    async function api(path, options = {}) {
        const headers = { Authorization: "Bearer " + token };
        let body;

        if (options.form) {
            body = options.form;
        } else if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(options.body);
        }

        const response = await fetch("/api" + path, {
            method: options.method || "GET",
            headers,
            body
        });

        let data = {};

        try {
            data = await response.json();
        } catch (e) { /* bukan JSON */ }

        if (response.status === 401) {
            logout();
            throw new Error(data.message || "Sesi berakhir, silakan login ulang");
        }

        if (!response.ok) {
            throw new Error(data.message || "Terjadi kesalahan");
        }

        return data;
    }

    async function downloadFile(fileUrl) {
        const filename = String(fileUrl).split("/").pop();
        const response = await fetch("/api/files/" + encodeURIComponent(filename), {
            headers: { Authorization: "Bearer " + token }
        });

        if (!response.ok) {
            let message = "Gagal mengunduh file";

            try { message = (await response.json()).message || message; } catch (e) { /* abaikan */ }

            throw new Error(message);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ---------- UI kecil ----------
    let toastTimer;

    function toast(message, ok = true) {
        let el = document.getElementById("toast");

        if (!el) {
            el = h("div", { id: "toast" });
            document.body.appendChild(el);
        }

        el.textContent = message;
        el.className = ok ? "" : "err";
        el.hidden = false;

        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
    }

    function badge(text, kind = "") {
        return h("span", { class: "badge " + kind }, text);
    }

    function parseDate(value) {
        if (!value) return null;

        const date = new Date(String(value).replace(" ", "T"));

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function fmtDate(value) {
        const date = parseDate(value);

        if (!date) return "-";

        return date.toLocaleString("id-ID", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        });
    }

    function fmtNum(value) {
        if (value === null || value === undefined || value === "") return "-";

        return Number(value).toLocaleString("id-ID", { maximumFractionDigits: 2 });
    }

    function table(columns, rows, emptyText = "Belum ada data.") {
        const head = h("tr", {}, columns.map((c) => h("th", {}, c.label)));
        const body = h("tbody");

        if (!rows.length) {
            body.append(h("tr", {}, h("td", { class: "empty", colspan: columns.length }, emptyText)));
        }

        rows.forEach((row, index) => {
            body.append(h("tr", {}, columns.map((c) => {
                const value = c.render ? c.render(row, index) : row[c.key];

                return h("td", {}, value === null || value === undefined || value === "" ? "-" : value);
            })));
        });

        return h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, head), body));
    }

    // ---------- Modal form ----------
    function buildField(field, value) {
        const id = "f_" + field.name;
        let input;

        if (field.type === "select") {
            input = h("select", { id, name: field.name, required: field.required },
                h("option", { value: "" }, field.placeholder || "Pilih..."),
                (field.options || []).map((o) => h("option", {
                    value: o.value,
                    selected: String(o.value) === String(value ?? "")
                }, o.label)));
        } else if (field.type === "textarea") {
            input = h("textarea", {
                id, name: field.name, required: field.required,
                placeholder: field.placeholder, maxlength: field.maxlength
            });
            input.value = value ?? "";
        } else {
            input = h("input", {
                id, name: field.name, type: field.type || "text",
                required: field.required, placeholder: field.placeholder,
                minlength: field.minlength, maxlength: field.maxlength,
                min: field.min, max: field.max, step: field.step,
                autocomplete: field.type === "password" ? "new-password" : "off",
                accept: field.accept
            });

            if (field.type !== "file") input.value = value ?? "";
        }

        return h("div", { class: "form-group" + (field.full ? " full" : "") },
            h("label", { for: id }, field.label),
            input,
            field.hint ? h("small", {}, field.hint) : null);
    }

    function formModal({ title, fields, values = {}, submitText = "Simpan", onSubmit }) {
        const error = h("div", { class: "form-error", role: "alert" });
        const submit = h("button", { type: "submit", class: "btn-primary" }, submitText);
        const form = h("form", {},
            h("div", { class: "form-grid" }, fields.map((f) => buildField(f, values[f.name]))),
            error,
            h("div", { class: "form-actions" },
                h("button", { type: "button", class: "btn-secondary", onclick: close }, "Batal"),
                submit));

        const overlay = h("div", { class: "overlay" }, h("div", { class: "modal" }, h("h3", {}, title), form));

        function close() {
            overlay.classList.add("closing");
            setTimeout(() => overlay.remove(), 160);
        }

        overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            error.textContent = "";
            submit.disabled = true;

            const data = {};
            const formData = new FormData(form);

            fields.forEach((f) => {
                data[f.name] = f.type === "file"
                    ? form.elements[f.name].files[0] || null
                    : String(formData.get(f.name) ?? "").trim();
            });

            try {
                await onSubmit(data, close);
            } catch (e) {
                error.textContent = e.message;
            } finally {
                submit.disabled = false;
            }
        });

        document.body.appendChild(overlay);

        const first = form.querySelector("input, select, textarea");

        if (first) first.focus();

        return { close };
    }

    function viewModal(title, ...content) {
        const overlay = h("div", { class: "overlay" },
            h("div", { class: "modal" },
                h("h3", {}, title),
                content,
                h("div", { class: "form-actions" },
                    h("button", { class: "btn-secondary", onclick: () => overlay.remove() }, "Tutup"))));

        overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    // ---------- Avatar (foto profil dimuat dengan token) ----------
    function avatar(userId, nama, hasPhoto, size = 40) {
        const el = h("div", {
            class: "avatar",
            style: `width:${size}px;height:${size}px;font-size:${Math.round(size / 2.3)}px`
        }, (String(nama || "?").trim()[0] || "?").toUpperCase());

        if (hasPhoto) {
            fetch("/api/profile/photo/" + userId, { headers: { Authorization: "Bearer " + token } })
                .then((r) => (r.ok ? r.blob() : null))
                .then((blob) => {
                    if (!blob) return;

                    el.textContent = "";
                    el.append(h("img", { src: URL.createObjectURL(blob), alt: "Foto " + nama }));
                })
                .catch(() => {});
        }

        return el;
    }


    // ---------- Jam & kalender real-time (waktu server, tidak bisa dipalsukan) ----------
    const clockState = { offset: 0, zona: "Asia/Jakarta", info: null, lastDate: null, ready: false };
    const clockListeners = [];

    function wibParts(date) {
        const p = {};

        for (const part of new Intl.DateTimeFormat("en-GB", {
            timeZone: clockState.zona, year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
        }).formatToParts(date)) p[part.type] = part.value;

        return p;
    }

    function today() {
        const p = wibParts(new Date(Date.now() + clockState.offset));

        return `${p.year}-${p.month}-${p.day}`;
    }

    async function syncClock() {
        const r = await api("/calendar/today");

        clockState.offset = r.now.epoch - Date.now();
        clockState.zona = r.now.zona;
        clockState.info = r;
        clockState.lastDate = r.now.tanggal;
        clockState.ready = true;

        return r;
    }

    function zoneLabel() {
        return { "Asia/Jakarta": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT" }[clockState.zona] || clockState.zona;
    }

    function buildClock() {
        const time = h("strong", { class: "clock-time" }, "--:--:--");
        const date = h("span", { class: "clock-date" }, "");
        const chip = h("span", { class: "chip" }, "");
        const box = h("div", { class: "clock", title: "Waktu server sekolah" }, time, h("div", {}, date, chip));
        const dateFmt = new Intl.DateTimeFormat("id-ID", {
            timeZone: clockState.zona, weekday: "long", day: "numeric", month: "long", year: "numeric"
        });

        function paintStatus() {
            const hs = clockState.info && clockState.info.hari_ini;

            if (!hs) return;

            chip.className = "chip " + (hs.aktif ? "ok" : "off");
            chip.textContent = hs.aktif
                ? "Hari belajar · masuk " + clockState.info.jam_masuk
                : "Libur" + (hs.alasan ? " · " + hs.alasan : "");
        }

        function tick() {
            if (!clockState.ready) return;

            const now = new Date(Date.now() + clockState.offset);
            const p = wibParts(now);

            time.textContent = `${p.hour}:${p.minute}:${p.second}`;
            date.textContent = dateFmt.format(now) + " " + zoneLabel();

            const tgl = `${p.year}-${p.month}-${p.day}`;

            // Ganti hari (lewat tengah malam): ambil ulang status & beri tahu halaman
            if (tgl !== clockState.lastDate) {
                clockState.lastDate = tgl;
                syncClock().then(() => {
                    paintStatus();
                    clockListeners.forEach((fn) => { try { fn(tgl); } catch (e) { /* abaikan */ } });
                }).catch(() => {});
            }
        }

        syncClock().then(() => { paintStatus(); tick(); }).catch(() => {});
        setInterval(tick, 1000);
        // Sinkron ulang berkala agar libur yang baru ditambahkan admin ikut tampil
        setInterval(() => syncClock().then(paintStatus).catch(() => {}), 5 * 60 * 1000);

        return box;
    }

    function onNewDay(fn) {
        clockListeners.push(fn);
    }

    // ---------- Shell (sidebar + topbar) ----------
    async function shell(role, active, title) {
        if (!token) {
            window.location.href = "/login.html";
            return null;
        }

        let user;

        try {
            const result = await api("/auth/me");

            user = result.user;
        } catch (e) {
            return null;
        }

        if (user.role !== role) {
            window.location.href = HOME[user.role] || "/login.html";
            return null;
        }

        sessionStorage.setItem("user", JSON.stringify(user));

        let hasPhoto = false;

        try {
            hasPhoto = (await api("/profile")).profile.has_photo;
        } catch (e) { /* abaikan */ }
        document.title = title + " - Smart School";

        const content = h("section", { class: "content" });

        const root = document.getElementById("app");

        root.className = "layout";
        root.append(
            h("aside", { class: "sidebar" },
                h("h2", {}, "SMART SCHOOL"),
                h("div", { class: "role-label" }, ROLE_NAMES[user.role]),
                MENUS[role].map(([key, label, href]) =>
                    h("a", { href, class: key === active ? "active" : "" }, label))),
            h("main", { class: "main" },
                h("header", { class: "topbar" },
                    h("h2", {}, title),
                    buildClock(),
                    h("div", { class: "who" },
                        avatar(user.id, user.nama, hasPhoto, 38),
                        h("span", {}, h("strong", {}, user.nama), h("br"), ROLE_NAMES[user.role]),
                        h("button", { class: "btn-danger", onclick: logout }, "Keluar"))),
                content));

        return { user, content };
    }

    function heading(title, description) {
        return h("div", { class: "page-heading" }, h("h1", {}, title), description ? h("p", {}, description) : null);
    }

    // Angka pada kartu statistik dihitung naik dari 0 (dilewati bila pengguna mematikan animasi)
    function countUp(el, target) {
        const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (reduce || !Number.isFinite(target) || target === 0) return;

        const duration = 700;
        const start = performance.now();

        function step(now) {
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);

            el.textContent = String(Math.round(target * eased));

            if (t < 1) requestAnimationFrame(step);
            else el.textContent = String(target);
        }

        el.textContent = "0";
        requestAnimationFrame(step);
    }

    function statGrid(items) {
        return h("div", { class: "stat-grid" }, items.map(([label, value]) => {
            const p = h("p", {}, value);

            if (typeof value === "number") countUp(p, value);

            return h("div", { class: "stat" }, h("h4", {}, label), p);
        }));
    }

    // ---------- CRUD generik ----------
    /* config: {
         title, description, endpoint, listKey, addLabel, searchKeys, filters,
         columns(ctx), fields(item, ctx), load(ctx)?, toPayload(data, item)?,
         canAdd, canEdit, canDelete, extraActions(row, reload)?
       } */
    async function crud(content, config) {
        const state = { rows: [], ctx: {} };
        const canAdd = config.canAdd !== false;
        const canEdit = config.canEdit !== false;
        const canDelete = config.canDelete !== false;

        const search = h("input", { type: "search", placeholder: config.searchPlaceholder || "Cari...", class: "grow" });
        const filterEls = (config.filters || []).map((f) => ({
            def: f,
            el: h("select", {},
                h("option", { value: "" }, f.label),
                f.options.map((o) => h("option", { value: o.value }, o.label)))
        }));

        const tableBox = h("div");
        const addButton = canAdd
            ? h("button", { class: "btn-primary", onclick: () => openForm(null) }, config.addLabel || "+ Tambah")
            : null;

        content.append(
            heading(config.title, config.description),
            h("div", { class: "card" },
                h("div", { class: "toolbar" },
                    h("div", { class: "grow" }, search),
                    filterEls.map((f) => f.el),
                    addButton),
                tableBox));

        function visibleRows() {
            const keyword = search.value.trim().toLowerCase();

            return state.rows.filter((row) => {
                const matchText = !keyword || (config.searchKeys || []).some((k) =>
                    String(row[k] ?? "").toLowerCase().includes(keyword));
                const matchFilters = filterEls.every(({ def, el }) =>
                    !el.value || String(row[def.key]) === el.value);

                return matchText && matchFilters;
            });
        }

        function render() {
            const columns = config.columns(state.ctx).slice();

            if (canEdit || canDelete || config.extraActions) {
                columns.push({
                    label: "Aksi",
                    render: (row) => h("div", { class: "actions" },
                        config.extraActions ? config.extraActions(row, reload) : null,
                        canEdit ? h("button", { class: "btn-edit btn-sm", onclick: () => openForm(row) }, "Edit") : null,
                        canDelete ? h("button", { class: "btn-danger btn-sm", onclick: () => remove(row) }, "Hapus") : null)
                });
            }

            const rows = visibleRows();

            tableBox.replaceChildren(table(
                [{ label: "No.", render: (r, i) => i + 1 }, ...columns],
                rows,
                state.rows.length ? "Tidak ada data yang cocok." : "Belum ada data."));
        }

        async function reload() {
            try {
                if (config.load) state.ctx = await config.load();

                const result = await api(config.endpoint);

                state.rows = result[config.listKey] || [];
                render();
            } catch (e) {
                tableBox.replaceChildren(h("p", { class: "form-error" }, e.message));
            }
        }

        async function openForm(item) {
            try {
                if (config.load) state.ctx = await config.load(item);
            } catch (e) {
                return toast(e.message, false);
            }

            const fields = config.fields(item, state.ctx);

            formModal({
                title: (item ? "Edit " : "Tambah ") + (config.itemName || config.title),
                fields,
                values: config.formValues ? config.formValues(item) : (item || {}),
                submitText: item ? "Simpan Perubahan" : "Simpan",
                onSubmit: async (data, close) => {
                    const payload = config.toPayload ? config.toPayload(data, item) : data;
                    const result = await api(
                        config.endpoint + (item ? "/" + item.id : ""),
                        { method: item ? "PUT" : "POST", body: payload });

                    toast(result.message || "Berhasil disimpan");
                    close();
                    await reload();
                }
            });
        }

        async function remove(row) {
            const label = config.rowLabel ? config.rowLabel(row) : "data ini";

            if (!confirm("Yakin ingin menghapus " + label + "?")) return;

            try {
                const result = await api(config.endpoint + "/" + row.id, { method: "DELETE" });

                toast(result.message || "Berhasil dihapus");
                await reload();
            } catch (e) {
                toast(e.message, false);
            }
        }

        search.addEventListener("input", render);
        filterEls.forEach((f) => f.el.addEventListener("change", render));

        await reload();

        return { reload };
    }

    window.App = {
        avatar, api, h, shell, heading, statGrid, table, badge, toast, formModal, viewModal, crud,
        fmtDate, fmtNum, parseDate, downloadFile, logout, ROLE_NAMES, HOME, today, onNewDay,
        get user() { return storedUser; }
    };
})();
