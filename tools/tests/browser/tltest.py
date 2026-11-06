import subprocess, sys, time, json, re, base64, io, zipfile
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8812", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("try { localStorage.setItem('lw.abfrageAnsicht','klassisch') } catch (e) {}")
        A.goto("http://localhost:8812/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        # Fake-KI: antwortet kurz; manchmal absichtlich mit „der Patient“; zählt Sprachausgabe
        A.evaluate("""() => { const L = window.__lw; window.__tts = 0;
            if (window.speechSynthesis) { const o = window.speechSynthesis.speak.bind(window.speechSynthesis); window.speechSynthesis.speak = (u) => { window.__tts++; }; }
            let n = 0; L.kiTest.chat = async (msgs, on) => { n++; await new Promise(r => setTimeout(r, 5)); const q = msgs[msgs.length - 1].content.split('\\n')[0];
              const t = n % 7 === 0 ? 'Der Patient liegt da.' : /Notfallort|Adresse|adresse/.test(q) ? 'Hauptstraße 5, Testdorf.' : 'Ja, so ist das.'; on(t); return t; }; }""")
        r = A.evaluate("""async () => { const L = window.__lw; const T = L.testlauf; const s = L.sim;
            const vorher = s.state.einsaetze.length;
            const f = L.faelle.alleFaelle(false).find(x => x.id === 'fk_kleinkind');
            const auf = T.auftraegeFuer([f], 'alle', 2);
            const ab = { ja: false }; let fort = 0;
            const liste = await T.testlaufAusfuehren(auf, { abbruch: ab, fortschritt: () => fort++ });
            const dateien = T.testlaufDateien(liste, false);
            return { auftraege: auf.length, varianten: [...new Set(auf.map(x => x.variante))], n: liste.length, fort, nachher: s.state.einsaetze.length - vorher,
              dateien: dateien.map(d => d[0]), uebersicht: dateien[0][1], erster: dateien[1] ? dateien[1][1].slice(0, 2500) : '',
              fragen: liste.map(x => x.fragen), auff: liste.flatMap(x => x.auffaellig.map(a => a.grund)), ereignis: liste.map(x => /\\(Verlauf\\)|Anrufer meldet|blau|rausgekommen/.test(x.text)), tts: window.__tts }; }""")
        print("    Aufträge:", r["auftraege"], r["varianten"], "Fragen je Gespräch:", r["fragen"])
        print("    Auffällig:", r["auff"][:6])
        print("   ", r["erster"][:1600])
        check(r["auftraege"] == 2 * len(r["varianten"]) and r["n"] == r["auftraege"] and r["fort"] == r["auftraege"], "alle Ausgänge × 2 durchgespielt")
        check(r["nachher"] == 0, "Testgespräche kommen nicht ins Spiel")
        check(r["dateien"][0] == "00_Uebersicht.md" and len(r["dateien"]) == r["n"] + 1, "Übersicht + eine Datei je Gespräch")
        check(all(x >= 10 for x in r["fragen"]), "je Gespräch mindestens 10 Fragen")
        check(len(r["auff"]) > 0, "Auffälligkeiten werden gemeldet")
        check(r["tts"] == 0, "nichts wird vorgelesen")
        check("Gesprächsexport" in r["erster"] and "## Auffällig" in r["erster"], "Gesprächsdatei im Export-Format")
        # alle Fälle, je 1, nur Ausgang A
        r = A.evaluate("""async () => { const L = window.__lw; const T = L.testlauf;
            const fs = L.faelle.alleFaelle(false); const auf = T.auftraegeFuer(fs, 'A', 1);
            const t0 = performance.now(); const liste = await T.testlaufAusfuehren(auf, { abbruch: { ja: false } });
            return { faelle: fs.length, auf: auf.length, n: liste.length, ms: performance.now() - t0, fehlt: auf.filter(a => !liste.some(x => x.fallId === a.fallId)).map(a => a.fallId) }; }""")
        print("   ", r)
        check(r["n"] == r["auf"] and r["auf"] >= 14, f"alle Fälle durchgespielt (fehlt: {r['fehlt']})")
        # Abbrechen
        r = A.evaluate("""async () => { const L = window.__lw; const T = L.testlauf;
            const f = L.faelle.alleFaelle(false).find(x => x.id === 'kollaps'); const ab = { ja: false };
            const p = T.testlaufAusfuehren(T.auftraegeFuer([f], 'A', 20), { abbruch: ab, fortschritt: (n) => { if (n === 3) ab.ja = true; } });
            const liste = await p; return liste.length; }""")
        check(r == 3, f"Abbrechen hält an ({r})")
        # ZIP lesbar
        z = A.evaluate("""() => { const d = window.__lw.testlauf.zipOhneKompression([['00_Uebersicht.md', '# Ü – äöü'], ['001_x.md', 'Hallo']]); let s = ''; for (const b of d) s += String.fromCharCode(b); return btoa(s); }""")
        zf = zipfile.ZipFile(io.BytesIO(base64.b64decode(z)))
        check(zf.namelist() == ["00_Uebersicht.md", "001_x.md"] and zf.read("00_Uebersicht.md").decode() == "# Ü – äöü", "ZIP ist lesbar")
        # Knöpfe im Fall-Editor
        A.evaluate("() => window.__lw.fallEditorOeffnen()"); A.wait_for_timeout(800)
        check(A.locator("text=🧪 Alle testen").count() == 1, "Knopf „Alle testen“")
        A.locator(".fe-punkt").first.click(); A.wait_for_timeout(500)
        check(A.locator(".fe-test").count() == 1, "Knopf „Testlauf“ beim Fall")
        A.locator(".fe-test").click(); A.wait_for_timeout(500)
        check(A.locator(".dlg .tl-wahl select").count() == 1, "Testlauf-Fenster mit Ausgang und Anzahl")
        A.screenshot(path=f"{S}/tl_dialog.png")
        A.evaluate("() => { window.__lw.kiTest.chat = null; }")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
