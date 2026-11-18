
const token = sessionStorage.getItem("token");

const userForm = document.getElementById("userForm");
const userTable = document.getElementById("userTable");
const message = document.getElementById("message");

let allUsers = [];

const headers = {
    "Authorization": "Bearer " + token,
    "Content-Type": "application/json"
};

const roleNames = {
    admin: "Administrator",
    guru: "Guru",
    wali_kelas: "Wali Kelas",
    siswa: "Siswa"
};

function showMessage(text, success = false) {
    message.textContent = text;
    message.style.color = success ? "#15803d" : "#dc2626";
}

function logout() {
    sessionStorage.clear();
    window.location.href = "/login.html";
}

async function checkAdmin() {
    if (!token) {
        window.location.href = "/login.html";
        return false;
    }

    try {
        const response = await fetch("/api/auth/me", { headers });
        const result = await response.json();

        if (!response.ok || result.user.role !== "admin") {
            throw new Error("Akses hanya untuk administrator");
        }

        document.getElementById("adminName").textContent =
            result.user.nama + " (Administrator)";

        return true;
    } catch (error) {
        alert(error.message);
        logout();
        return false;
    }
}

async function loadUsers() {
    try {
        const response = await fetch("/api/users", { headers });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Gagal mengambil pengguna");
        }

        allUsers = result.users;
        renderUsers();
    } catch (error) {
        userTable.textContent = "";
        const row = userTable.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 6;
        cell.textContent = error.message;
    }
}

function renderUsers() {
    const keyword = document.getElementById("searchInput")
        .value.trim().toLowerCase();

    const selectedRole = document.getElementById("roleFilter").value;

    const filteredUsers = allUsers.filter(user => {
        const matchesKeyword =
            user.nama.toLowerCase().includes(keyword) ||
            user.username.toLowerCase().includes(keyword);

        const matchesRole =
            !selectedRole || user.role === selectedRole;

        return matchesKeyword && matchesRole;
    });

    userTable.textContent = "";

    if (filteredUsers.length === 0) {
        const row = userTable.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 6;
        cell.textContent = "Tidak ada pengguna ditemukan.";
        return;
    }

    filteredUsers.forEach((user, index) => {
        const row = userTable.insertRow();

        const values = [
            index + 1,
            user.nama,
            user.username,
            roleNames[user.role] || user.role
        ];

        values.forEach(value => {
            const cell = row.insertCell();
            cell.textContent = value;
        });

        const statusCell = row.insertCell();
        const statusBadge = document.createElement("span");
        statusBadge.className = "status-badge" +
            (user.status === "nonaktif" ? " nonaktif" : "");
        statusBadge.textContent = user.status;
        statusCell.appendChild(statusBadge);

        const actionCell = row.insertCell();

        const editButton = document.createElement("button");
        editButton.className = "btn-edit";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => editUser(user.id));

        const deleteButton = document.createElement("button");
        deleteButton.className = "btn-danger";
        deleteButton.textContent = "Hapus";
        deleteButton.addEventListener("click", () => deleteUser(user.id));

        actionCell.append(editButton, deleteButton);
    });
}

function resetForm() {
    userForm.reset();
    document.getElementById("userId").value = "";
    document.getElementById("formTitle").textContent =
        "Tambah Pengguna Baru";
    document.getElementById("submitButton").textContent =
        "Simpan Pengguna";
    document.getElementById("password").required = true;
    document.getElementById("passwordHint").textContent =
        "Password wajib diisi untuk pengguna baru.";
    document.getElementById("cancelButton").hidden = true;
    showMessage("");
}

function editUser(id) {
    const user = allUsers.find(item => item.id === id);

    if (!user) return;

    document.getElementById("userId").value = user.id;
    document.getElementById("nama").value = user.nama;
    document.getElementById("username").value = user.username;
    document.getElementById("role").value = user.role;
    document.getElementById("password").value = "";
    document.getElementById("password").required = false;

    document.getElementById("formTitle").textContent =
        "Edit Data Pengguna";
    document.getElementById("submitButton").textContent =
        "Simpan Perubahan";
    document.getElementById("passwordHint").textContent =
        "Kosongkan jika tidak ingin mengganti password.";
    document.getElementById("cancelButton").hidden = false;

    showMessage("Sedang mengedit: " + user.nama, true);

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

userForm.addEventListener("submit", async event => {
    event.preventDefault();

    const id = document.getElementById("userId").value;
    const password = document.getElementById("password").value;

    const data = {
        nama: document.getElementById("nama").value.trim(),
        username: document.getElementById("username").value.trim(),
        role: document.getElementById("role").value
    };

    if (password) {
        data.password = password;
    }

    if (!id && !password) {
        showMessage("Password wajib diisi.");
        return;
    }

    const button = document.getElementById("submitButton");
    button.disabled = true;

    try {
        const response = await fetch(
            id ? "/api/users/" + id : "/api/users",
            {
                method: id ? "PUT" : "POST",
                headers,
                body: JSON.stringify(data)
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Gagal menyimpan pengguna");
        }

        showMessage(result.message, true);
        resetForm();
        await loadUsers();

    } catch (error) {
        showMessage(error.message);
    } finally {
        button.disabled = false;
    }
});

async function deleteUser(id) {
    const user = allUsers.find(item => item.id === id);

    if (!user) return;

    const confirmed = confirm(
        "Apakah kamu yakin ingin menghapus akun " +
        user.nama + "?"
    );

    if (!confirmed) return;

    try {
        const response = await fetch("/api/users/" + id, {
            method: "DELETE",
            headers
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Gagal menghapus pengguna");
        }

        showMessage(result.message, true);
        await loadUsers();

    } catch (error) {
        showMessage(error.message);
    }
}

document.getElementById("searchInput")
    .addEventListener("input", renderUsers);

document.getElementById("roleFilter")
    .addEventListener("change", renderUsers);

document.getElementById("cancelButton")
    .addEventListener("click", resetForm);

document.getElementById("logoutButton")
    .addEventListener("click", logout);

document.addEventListener("DOMContentLoaded", async () => {
    const isAdmin = await checkAdmin();

    if (isAdmin) {
        await loadUsers();
    }
});
