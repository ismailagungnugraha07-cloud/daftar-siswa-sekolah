
async function loadAdmin() {
    const token = sessionStorage.getItem("token");

    if (!token) {
        window.location.href = "/login.html";
        return;
    }

    try {
        const headers = {
            "Authorization": "Bearer " + token
        };

        const meResponse = await fetch("/api/auth/me", { headers });
        const meResult = await meResponse.json();

        if (!meResponse.ok) {
            throw new Error(meResult.message || "Sesi tidak valid");
        }

        if (meResult.user.role !== "admin") {
            throw new Error("Akses hanya untuk admin");
        }

        document.getElementById("adminName").textContent =
            meResult.user.nama + " (Administrator)";

        const statsResponse = await fetch("/api/auth/stats", { headers });
        const statsResult = await statsResponse.json();

        if (!statsResponse.ok) {
            throw new Error(statsResult.message || "Gagal mengambil statistik");
        }

        document.getElementById("totalUsers").textContent =
            statsResult.statistics.totalUsers;

        document.getElementById("totalStudents").textContent =
            statsResult.statistics.totalStudents;

        document.getElementById("totalTeachers").textContent =
            statsResult.statistics.totalTeachers;

    } catch (error) {
        console.error(error);
        sessionStorage.clear();
        alert(error.message);
        window.location.href = "/login.html";
    }
}

function logout() {
    sessionStorage.clear();
    window.location.href = "/login.html";
}

document.addEventListener("DOMContentLoaded", () => {
    const logoutButton = document.getElementById("logoutButton");

    if (logoutButton) {
        logoutButton.addEventListener("click", logout);
    }

    loadAdmin();
});
