
const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;
        const message = document.getElementById("message");
        const button = document.getElementById("loginButton");

        button.disabled = true;
        button.textContent = "Memproses...";
        message.textContent = "";

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (!response.ok || !result.token || !result.user) {
                throw new Error(result.message || "Login gagal");
            }

            sessionStorage.setItem("token", result.token);
            sessionStorage.setItem("user", JSON.stringify(result.user));

            const destinations = {
                admin: "/admin/dashboard.html",
                guru: "/guru/dashboard.html",
                wali_kelas: "/wali-kelas/dashboard.html",
                siswa: "/siswa/dashboard.html"
            };

            const destination = destinations[result.user.role];

            if (!destination) {
                throw new Error("Role pengguna tidak dikenali");
            }

            window.location.href = destination;

        } catch (error) {
            message.textContent = error.message;
            message.style.color = "red";
        } finally {
            button.disabled = false;
            button.textContent = "Masuk ke Sistem";
        }
    });
}
