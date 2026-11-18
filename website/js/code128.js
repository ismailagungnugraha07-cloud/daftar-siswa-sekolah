/* Pembuat barcode Code 128 (set B, ASCII 32-126) sebagai SVG. Tanpa pustaka luar.
   Code128.svg("SSABCD2345", { tinggi: 60, modul: 2 }) -> elemen <svg> */
(function () {
    const POLA = [
        "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
        "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
        "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
        "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
        "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
        "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
        "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
        "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
        "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
        "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
        "114131", "311141", "411131", "211412", "211214", "211232"
    ];
    const BERHENTI = "2331112";
    const MULAI_B = 104;

    function modul(teks) {
        const kode = [MULAI_B];

        for (const ch of String(teks)) {
            const c = ch.charCodeAt(0);

            if (c < 32 || c > 126) throw new Error("Karakter tidak didukung Code128-B: " + ch);

            kode.push(c - 32);
        }

        let cek = kode[0];

        for (let i = 1; i < kode.length; i++) cek += kode[i] * i;

        kode.push(cek % 103);

        return kode.map((k) => POLA[k]).join("") + BERHENTI;
    }

    function svg(teks, opsi = {}) {
        const lebarModul = opsi.modul || 2;
        const tinggi = opsi.tinggi || 60;
        const tenang = 10; // zona tenang (dalam modul) kiri & kanan
        const urutan = modul(teks);
        const ns = "http://www.w3.org/2000/svg";
        const total = [...urutan].reduce((a, n) => a + Number(n), 0) + tenang * 2;
        const el = document.createElementNS(ns, "svg");

        el.setAttribute("viewBox", `0 0 ${total} ${tinggi}`);
        el.setAttribute("preserveAspectRatio", "none");
        el.setAttribute("shape-rendering", "crispEdges");
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", "Barcode " + teks);
        el.style.width = opsi.lebar || total * lebarModul + "px";
        el.style.height = tinggi + "px";

        const bg = document.createElementNS(ns, "rect");

        bg.setAttribute("width", total);
        bg.setAttribute("height", tinggi);
        bg.setAttribute("fill", "#fff");
        el.appendChild(bg);

        let x = tenang;

        [...urutan].forEach((n, i) => {
            const w = Number(n);

            if (i % 2 === 0) {
                const r = document.createElementNS(ns, "rect");

                r.setAttribute("x", x);
                r.setAttribute("width", w);
                r.setAttribute("height", tinggi);
                r.setAttribute("fill", "#000");
                el.appendChild(r);
            }

            x += w;
        });

        return el;
    }

    window.Code128 = { svg, modul, POLA };
})();
