(async function () {
    const page = await App.shell("admin", "guru", "Data Guru");

    if (!page) return;

    await App.crud(page.content, {
        title: "Data Guru",
        itemName: "Guru",
        description: "Hubungkan akun guru / wali kelas dengan NIP.",
        endpoint: "/teachers",
        listKey: "teachers",
        addLabel: "+ Tambah Data Guru",
        searchPlaceholder: "Cari nama, NIP, atau username...",
        searchKeys: ["nama", "nip", "username"],
        rowLabel: (row) => "data guru " + row.nama,
        load: async (item) => {
            const free = (await App.api("/users?unlinked=1")).users
                .filter((u) => (u.role === "guru" || u.role === "wali_kelas") && u.status === "aktif");

            if (item && !free.some((u) => u.id === item.user_id)) {
                free.push({ id: item.user_id, nama: item.nama, username: item.username });
            }

            return { accounts: free };
        },
        columns: () => [
            { label: "NIP", key: "nip" },
            { label: "Nama", key: "nama" },
            { label: "Username", key: "username" },
            { label: "Role", render: (r) => App.ROLE_NAMES[r.role] || r.role },
            { label: "Wali Kelas Dari", key: "kelas_wali" }
        ],
        fields: (item, ctx) => [
            {
                name: "user_id",
                label: "Akun Guru",
                type: "select",
                required: true,
                placeholder: ctx.accounts.length ? "Pilih akun guru" : "Tidak ada akun guru yang tersedia",
                options: ctx.accounts.map((u) => ({ value: u.id, label: u.nama + " (" + u.username + ")" })),
                hint: "Buat akun role Guru / Wali Kelas dulu di menu Data Pengguna."
            },
            { name: "nip", label: "NIP", required: true, maxlength: 30, placeholder: "Nomor Induk Pegawai" }
        ]
    });
})();
