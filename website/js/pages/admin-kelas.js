(async function () {
    const page = await App.shell("admin", "kelas", "Manajemen Kelas");

    if (!page) return;

    await App.crud(page.content, {
        title: "Data Kelas",
        itemName: "Kelas",
        description: "Kelola kelas, jurusan, dan wali kelas.",
        endpoint: "/classes",
        listKey: "classes",
        addLabel: "+ Tambah Kelas",
        searchPlaceholder: "Cari kelas, jurusan, atau wali kelas...",
        searchKeys: ["nama_kelas", "jurusan", "wali_kelas_nama"],
        rowLabel: (row) => "kelas " + row.nama_kelas,
        load: async () => {
            const result = await App.api("/users");

            return {
                teachers: result.users.filter((u) =>
                    (u.role === "guru" || u.role === "wali_kelas") && u.status === "aktif")
            };
        },
        columns: () => [
            { label: "Nama Kelas", key: "nama_kelas" },
            { label: "Jurusan", key: "jurusan" },
            { label: "Wali Kelas", key: "wali_kelas_nama" },
            { label: "Jumlah Siswa", key: "jumlah_siswa" }
        ],
        fields: (item, ctx) => [
            { name: "nama_kelas", label: "Nama Kelas", required: true, maxlength: 50, placeholder: "Contoh: X RPL 1" },
            { name: "jurusan", label: "Jurusan", maxlength: 80, placeholder: "Contoh: Rekayasa Perangkat Lunak" },
            {
                name: "wali_kelas_id",
                label: "Wali Kelas",
                type: "select",
                full: true,
                placeholder: "Belum ada wali kelas",
                options: ctx.teachers.map((t) => ({ value: t.id, label: t.nama + " (" + App.ROLE_NAMES[t.role] + ")" }))
            }
        ]
    });
})();
