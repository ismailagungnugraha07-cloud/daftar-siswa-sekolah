(async function () {
    const { h, badge } = App;
    const page = await App.shell("admin", "pengguna", "Manajemen Pengguna");

    if (!page) return;

    const roleOptions = Object.entries(App.ROLE_NAMES).map(([value, label]) => ({ value, label }));

    await App.crud(page.content, {
        title: "Data Pengguna",
        itemName: "Pengguna",
        description: "Kelola akun administrator, guru, wali kelas, dan siswa.",
        endpoint: "/users",
        listKey: "users",
        addLabel: "+ Tambah Pengguna",
        searchPlaceholder: "Cari nama atau username...",
        searchKeys: ["nama", "username"],
        filters: [{ key: "role", label: "Semua Role", options: roleOptions }],
        rowLabel: (row) => "akun " + row.nama,
        columns: () => [
            { label: "Nama", key: "nama" },
            { label: "Username", key: "username" },
            { label: "Role", render: (r) => App.ROLE_NAMES[r.role] || r.role },
            {
                label: "Status",
                render: (r) => badge(r.status, r.status === "aktif" ? "ok" : "bad")
            },
            {
                label: "Data Terkait",
                render: (r) => {
                    if (r.role === "siswa") return r.student_id ? badge("Data siswa lengkap", "ok") : badge("Belum ada data siswa", "warn");
                    if (r.role === "guru" || r.role === "wali_kelas") return r.teacher_id ? badge("Data guru lengkap", "ok") : badge("Belum ada data guru", "warn");

                    return h("span", { class: "muted" }, "-");
                }
            }
        ],
        fields: (item) => {
            const fields = [
                { name: "nama", label: "Nama Lengkap", required: true, maxlength: 100, placeholder: "Masukkan nama lengkap" },
                { name: "username", label: "Username", required: true, maxlength: 50, placeholder: "Masukkan username" },
                {
                    name: "password",
                    label: "Password",
                    type: "password",
                    required: !item,
                    minlength: 6,
                    placeholder: item ? "Kosongkan jika tidak diganti" : "Minimal 6 karakter",
                    hint: item ? "Kosongkan jika tidak ingin mengganti password." : "Minimal 6 karakter."
                },
                { name: "role", label: "Hak Akses / Role", type: "select", required: true, options: roleOptions }
            ];

            if (item) {
                fields.push({
                    name: "status",
                    label: "Status Akun",
                    type: "select",
                    required: true,
                    options: [{ value: "aktif", label: "Aktif" }, { value: "nonaktif", label: "Nonaktif" }]
                });
            }

            return fields;
        },
        toPayload: (data, item) => {
            const payload = { nama: data.nama, username: data.username, role: data.role };

            if (data.password) payload.password = data.password;
            if (item) payload.status = data.status;

            return payload;
        }
    });
})();
