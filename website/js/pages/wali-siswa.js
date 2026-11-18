(async function () {
    const page = await App.shell("wali_kelas", "siswa", "Siswa Kelas");

    if (!page) return;

    await App.crud(page.content, {
        title: "Siswa Kelas",
        description: "Daftar siswa di kelas yang kamu ampu sebagai wali kelas.",
        endpoint: "/students",
        listKey: "students",
        searchPlaceholder: "Cari nama atau NIS...",
        searchKeys: ["nama", "nis", "nama_kelas"],
        canAdd: false,
        canEdit: false,
        canDelete: false,
        columns: () => [
            { label: "NIS", key: "nis" },
            { label: "Nama", key: "nama" },
            { label: "Kelas", key: "nama_kelas" },
            { label: "Alamat", key: "alamat" }
        ]
    });
})();
