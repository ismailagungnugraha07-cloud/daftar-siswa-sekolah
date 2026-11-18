/* Jembatan aplikasi Android <-> backend Smart School.
   Dimuat paling awal di setiap halaman oleh scripts/build-www.js.
   - Tampilan (HTML/JS/CSS) ada di dalam aplikasi, data diambil dari server sekolah.
   - Semua permintaan "/api/..." dan "/uploads/..." diarahkan ke alamat server yang disimpan. */
(function () {
    var KEY = "smartschool_server";

    function getServer() {
        try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
    }

    function setServer(url) {
        try { localStorage.setItem(KEY, url); } catch (e) { /* abaikan */ }
    }

    function clearServer() {
        try { localStorage.removeItem(KEY); } catch (e) { /* abaikan */ }
    }

    window.SmartSchoolMobile = { isApp: true, getServer: getServer, setServer: setServer, clearServer: clearServer };

    var path = location.pathname;
    var onSetup = /\/server\.html$/.test(path);
    var base = getServer();

    // Belum ada alamat server -> minta diisi dulu.
    if (!base && !onSetup) {
        location.replace("/server.html");
        return;
    }

    // Halaman depan web tidak dipakai di aplikasi.
    if (base && (path === "/" || /\/index\.html$/.test(path))) {
        location.replace("/login.html");
        return;
    }

    // Arahkan permintaan API ke server sekolah.
    var originalFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
        if (base && typeof input === "string" && (input.indexOf("/api/") === 0 || input.indexOf("/uploads/") === 0)) {
            input = base + input;
        }
        return originalFetch(input, init);
    };

    // Tombol kecil "Ganti server" di halaman login.
    if (/\/login\.html$/.test(path)) {
        document.addEventListener("DOMContentLoaded", function () {
            var link = document.createElement("a");
            link.href = "/server.html";
            link.textContent = "Server: " + base.replace(/^https?:\/\//, "") + " • Ganti";
            link.style.cssText = "position:fixed;left:0;right:0;bottom:10px;text-align:center;" +
                "font:12px system-ui,sans-serif;color:#173b68;opacity:.75;text-decoration:none";
            document.body.appendChild(link);
        });
    }

    // Unduhan file (blob) tidak jalan di WebView Android -> simpan sementara lalu buka menu Bagikan/Simpan.
    function blobToBase64(blob) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result).split(",")[1] || ""); };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    document.addEventListener("click", function (event) {
        var a = event.target && event.target.closest ? event.target.closest("a[download]") : null;
        var plugins = window.Capacitor && window.Capacitor.Plugins;

        if (!a || !/^blob:/.test(a.href) || !plugins || !plugins.Filesystem || !plugins.Share) return;

        event.preventDefault();

        var name = (a.getAttribute("download") || "unduhan").replace(/[^\w.\- ]+/g, "_");
        var pending = originalFetch(a.href); // mulai sekarang, sebelum blob dicabut aplikasi

        pending
            .then(function (r) { return r.blob(); })
            .then(blobToBase64)
            .then(function (data) {
                return plugins.Filesystem.writeFile({ path: name, data: data, directory: "CACHE" });
            })
            .then(function (saved) {
                return plugins.Share.share({ title: name, files: [saved.uri], dialogTitle: "Simpan / bagikan file" });
            })
            .catch(function (error) {
                if (error && /cancel/i.test(String(error.message || error))) return;
                alert("Gagal menyimpan file: " + (error && error.message ? error.message : error));
            });
    });
})();
