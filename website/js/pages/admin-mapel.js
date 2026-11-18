(async function () {
    const page = await App.shell("admin", "mapel", "Mata Pelajaran");

    if (!page) return;

    await App.crud(page.content, {
        title: "Mata Pelajaran",
        itemName: "Mata Pelajaran",
        description: "Kelola daftar mata pelajaran yang digunakan pada tugas.",
        endpoint: "/subjects",
        listKey: "subjects",
        addLabel: "+ Tambah Mata Pelajaran",
        searchPlaceholder: "Cari mata pelajaran...",
        searchKeys: ["nama_mapel"],
        rowLabel: (row) => "mata pelajaran " + row.nama_mapel,
        columns: () => [
            { label: "Mata Pelajaran", key: "nama_mapel" },
            { label: "Jumlah Tugas", key: "jumlah_tugas" }
        ],
        fields: () => [
            { name: "nama_mapel", label: "Nama Mata Pelajaran", required: true, maxlength: 100, full: true, placeholder: "Contoh: Matematika" }
        ]
    });
})();
