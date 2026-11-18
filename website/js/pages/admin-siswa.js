(async function () {
    const page = await App.shell("admin", "siswa", "Data Siswa");

    if (!page) return;

    const classes = (await App.api("/classes")).classes;

    await App.crud(page.content, {
        title: "Data Siswa",
        itemName: "Siswa",
        description: "Hubungkan akun siswa dengan NIS, kelas, dan alamat.",
        endpoint: "/students",
        listKey: "students",
        addLabel: "+ Tambah Data Siswa",
        searchPlaceholder: "Cari nama, NIS, atau kelas...",
        searchKeys: ["nama", "nis", "nama_kelas", "no_kamar"],
        filters: [{
            key: "kelas_id",
            label: "Semua Kelas",
            options: classes.map((c) => ({ value: c.id, label: c.nama_kelas }))
        }],
        rowLabel: (row) => "data siswa " + row.nama,
        load: async (item) => {
            // Hanya akun siswa yang belum punya data siswa (ditambah akun yang sedang diedit)
            const free = (await App.api("/users?role=siswa&unlinked=1")).users;
            const accounts = free.slice();

            if (item && !accounts.some((u) => u.id === item.user_id)) {
                accounts.push({ id: item.user_id, nama: item.nama, username: item.username });
            }

            return { accounts };
        },
        columns: () => [
            { label: "NIS", key: "nis" },
            { label: "Nama", key: "nama" },
            { label: "Username", key: "username" },
            { label: "Kelas", key: "nama_kelas" },
            { label: "L/P", key: "jenis_kelamin" },
            { label: "Kamar", key: "no_kamar" },
            { label: "Alamat", key: "alamat" }
        ],
        fields: (item, ctx) => [
            {
                name: "user_id",
                label: "Akun Siswa",
                type: "select",
                required: true,
                placeholder: ctx.accounts.length ? "Pilih akun siswa" : "Tidak ada akun siswa yang tersedia",
                options: ctx.accounts.map((u) => ({ value: u.id, label: u.nama + " (" + u.username + ")" })),
                hint: "Buat akun role Siswa dulu di menu Data Pengguna."
            },
            { name: "nis", label: "NIS", required: true, maxlength: 30, placeholder: "Nomor Induk Siswa" },
            {
                name: "kelas_id",
                label: "Kelas",
                type: "select",
                required: true,
                options: classes.map((c) => ({ value: c.id, label: c.nama_kelas }))
            },
            {
                name: "jenis_kelamin",
                label: "Jenis Kelamin",
                type: "select",
                placeholder: "Pilih...",
                options: [{ value: "L", label: "Laki-laki" }, { value: "P", label: "Perempuan" }]
            },
            { name: "no_kamar", label: "No. Kamar", maxlength: 20, placeholder: "Contoh: 210" },
            { name: "alamat", label: "Alamat", type: "textarea", full: true, maxlength: 300 }
        ]
    });
})();
