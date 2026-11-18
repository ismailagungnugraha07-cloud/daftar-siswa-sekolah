/* Halaman Profil: data diri, foto, dan ganti password (semua role). */
async function initProfil(role) {
    const { h, badge } = App;
    const page = await App.shell(role, "profil", "Profil Saya");

    if (!page) return;

    let profile;

    try {
        profile = (await App.api("/profile")).profile;
    } catch (e) {
        page.content.append(h("p", { class: "form-error" }, e.message));
        return;
    }

    const content = page.content;

    function field(name, label, value, opts = {}) {
        const input = opts.textarea
            ? h("textarea", { id: "p_" + name, name, maxlength: opts.maxlength })
            : h("input", { id: "p_" + name, name, type: opts.type || "text", maxlength: opts.maxlength, required: opts.required, autocomplete: opts.autocomplete || "off", placeholder: opts.placeholder });

        if (!opts.type || opts.type !== "password") input.value = value ?? "";

        return h("div", { class: "form-group" + (opts.full ? " full" : "") },
            h("label", { for: "p_" + name }, label), input, opts.hint ? h("small", {}, opts.hint) : null);
    }

    function info(label, value) {
        return h("div", { class: "info-row" }, h("span", {}, label), h("strong", {}, value || "-"));
    }

    function render() {
        content.replaceChildren();

        // ----- Kartu foto + identitas -----
        const fileInput = h("input", { type: "file", accept: ".jpg,.jpeg,.png,.webp", hidden: true });

        fileInput.addEventListener("change", async () => {
            const file = fileInput.files[0];

            if (!file) return;
            if (file.size > 2 * 1024 * 1024) return App.toast("Ukuran foto maksimal 2 MB", false);

            const form = new FormData();

            form.append("foto", file);

            try {
                App.toast((await App.api("/profile/photo", { method: "POST", form })).message);
                location.reload();
            } catch (e) {
                App.toast(e.message, false);
            }
        });

        const identity = [
            info("Username", profile.username),
            info("Role", App.ROLE_NAMES[profile.role])
        ];

        if (profile.role === "siswa") identity.push(info("NIS", profile.nis), info("Kelas", profile.nama_kelas));
        if (profile.nip !== undefined) identity.push(info("NIP", profile.nip));
        if (profile.kelas_wali) identity.push(info("Wali Kelas Dari", profile.kelas_wali));

        content.append(
            App.heading("Profil Saya", "Lengkapi data dirimu. NIS, NIP, dan kelas hanya bisa diubah oleh admin."),
            h("div", { class: "profile-grid" },
                h("div", { class: "card profile-card" },
                    App.avatar(profile.id, profile.nama, profile.has_photo, 110),
                    h("h3", { style: "margin:14px 0 4px" }, profile.nama),
                    badge(App.ROLE_NAMES[profile.role]),
                    h("div", { class: "actions", style: "justify-content:center;margin:16px 0" },
                        h("button", { class: "btn-primary btn-sm", onclick: () => fileInput.click() }, "Ganti Foto"),
                        profile.has_photo
                            ? h("button", {
                                class: "btn-danger btn-sm",
                                onclick: async () => {
                                    if (!confirm("Hapus foto profil?")) return;

                                    await App.api("/profile/photo", { method: "DELETE" });
                                    location.reload();
                                }
                            }, "Hapus Foto")
                            : null),
                    h("small", { class: "muted" }, "JPG, PNG, atau WEBP. Maks 2 MB."),
                    fileInput,
                    h("div", { class: "info-list" }, identity)),
                h("div", {},
                    personalCard(),
                    passwordCard())));
    }

    function personalCard() {
        const error = h("div", { class: "form-error", role: "alert" });
        const save = h("button", { type: "submit", class: "btn-primary" }, "Simpan Data Diri");
        const form = h("form", {},
            h("div", { class: "form-grid" },
                field("nama", "Nama Lengkap", profile.nama, { required: true, maxlength: 100, full: true }),
                field("telepon", "Nomor HP", profile.telepon, { maxlength: 20, placeholder: "08xxxxxxxxxx" }),
                field("alamat", "Alamat", profile.alamat, { textarea: true, maxlength: 300, full: true })),
            error,
            h("div", { style: "margin-top:16px" }, save));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            error.textContent = "";
            save.disabled = true;

            try {
                const result = await App.api("/profile", {
                    method: "PUT",
                    body: {
                        nama: form.elements.nama.value,
                        telepon: form.elements.telepon.value,
                        alamat: form.elements.alamat.value
                    }
                });

                profile = result.profile;
                App.toast(result.message);
                render();
            } catch (e) {
                error.textContent = e.message;
            } finally {
                save.disabled = false;
            }
        });

        return h("div", { class: "card" }, h("h3", {}, "Data Diri"), form);
    }

    function passwordCard() {
        const error = h("div", { class: "form-error", role: "alert" });
        const save = h("button", { type: "submit", class: "btn-primary" }, "Ganti Password");
        const form = h("form", {},
            h("div", { class: "form-grid" },
                field("current_password", "Password Lama", "", { type: "password", required: true, autocomplete: "current-password", full: true }),
                field("new_password", "Password Baru", "", { type: "password", required: true, maxlength: 72, autocomplete: "new-password", hint: "Minimal 6 karakter." }),
                field("confirm_password", "Ulangi Password Baru", "", { type: "password", required: true, maxlength: 72, autocomplete: "new-password" })),
            error,
            h("div", { style: "margin-top:16px" }, save));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            error.textContent = "";

            if (form.elements.new_password.value !== form.elements.confirm_password.value) {
                error.textContent = "Konfirmasi password tidak sama";
                return;
            }

            save.disabled = true;

            try {
                const result = await App.api("/profile/password", {
                    method: "PUT",
                    body: {
                        current_password: form.elements.current_password.value,
                        new_password: form.elements.new_password.value
                    }
                });

                form.reset();
                App.toast(result.message);
            } catch (e) {
                error.textContent = e.message;
            } finally {
                save.disabled = false;
            }
        });

        return h("div", { class: "card" }, h("h3", {}, "Keamanan Akun"), form);
    }

    render();
}
