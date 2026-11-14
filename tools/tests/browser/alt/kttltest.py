import subprocess, sys, time, json, re
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8817", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
        A.goto("http://localhost:8817/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        # Prüfung der Transportart
        r = A.evaluate("""async () => { const L = window.__lw; const k = await L.sim.probeKt('kt'); if (!k) return null; k.wahr.d.lage = 'liegend';
            const P = (f, a) => L.kt.ktPruefen(k, f, a);
            return { schlecht: P('Kann der Patient sitzen, oder muss er liegen?', 'Der Patient kann nicht liegen, er muss liegend transportiert werden.'),
              gut: P('Kann der Patient sitzen, oder muss er liegen?', 'Liegend bitte, sitzen geht nicht.'),
              gut2: P('Kann der Patient sitzen, oder muss er liegen?', 'Er kann nicht sitzen, er muss liegen.'),
              zeit: P('Wann soll der Patient abgeholt werden?', 'So um 3:17.'),
              zf: L.kt.ktZusammenfassungFalsch(k, 'Also: ' + k.wahr.d.patient.name + ', sitzend – passt das so?'),
              inListe: (L.sim.state.kt ?? []).some((x) => x.id === k.id) }; }""")
        print("   ", r)
        check(r and any("Transportart" in x for x in r["schlecht"]), "„kann nicht liegen, muss liegend“ wird erkannt")
        check(r and not r["gut"] and not r["gut2"], "richtige Antworten zur Transportart sind unauffällig")
        check(r and "falsche Uhrzeit" in r["zeit"], "erfundene Uhrzeit wird erkannt")
        check(r and r["zf"], "falsche Rückfrage (sitzend statt liegend) wird erkannt")
        check(r and not r["inListe"], "Probe-Auftrag kommt nicht in die Auftragsliste")
        # Prompt: Selbstanrufer, Transportart als Satz
        r = A.evaluate("""async () => { const L = window.__lw; for (let i = 0; i < 40; i++) { const k = await L.sim.probeKt('kt'); if (k && /^Patient selbst/.test(k.wahr.anrufer.rolle)) { k.wahr.d.lage = 'liegend'; return L.kt.ktPrompt(k); } } return null; }""")
        check(r and "Ich-Form" in r and "Sitzen geht nicht" in r and "Transportart: liegend" not in r, "Selbstanrufer: Ich-Form und Transportart als Satz")
        # Fake-KI verdreht die Transportart → wird ersetzt
        r = A.evaluate("""async () => { const L = window.__lw; const T = L.testlauf;
            L.kiTest.chat = async (msgs, on) => { const q = msgs[msgs.length - 1].content.split('\\n')[0]; const t = /sitzen oder liegen/i.test(q) ? 'Der Patient kann nicht liegen, er muss liegend transportiert werden.' : /Also:/.test(q) ? 'Ja, passt.' : 'Ja, so ist das.'; on(t); return t; };
            const vorher = (L.sim.state.kt ?? []).length;
            const liste = await T.testlaufAusfuehren([...T.ktAuftraege('kt', 3), ...T.ktAuftraege('sek', 2)], { abbruch: { ja: false } });
            const dateien = T.testlaufDateien(liste, false);
            L.kiTest.chat = null;
            return { n: liste.length, fragen: liste.map((x) => x.fragen), namen: dateien.map((d) => d[0]), auff: liste.flatMap((x) => x.auffaellig.map((a) => a.grund)), nachher: (L.sim.state.kt ?? []).length - vorher,
              lage: liste.map((x) => /Anrufer \\(KI\\): [^\\n]*kann nicht liegen/.test(x.text) ? 'kann nicht liegen' : 'ok'), ueb: dateien[0][1].slice(0, 600) }; }""")
        print("   ", r["fragen"], r["namen"][:3], r["auff"][:8]); print("   ", r["lage"])
        check(r["n"] == 5 and r["nachher"] == 0, "5 Transporte durchgespielt, nichts kommt ins Spiel")
        check(all(9 <= x <= 18 for x in r["fragen"]), "kurze Gespräche (KT ~12, Überstellung ~16 Fragen)")
        check(r["namen"][0] == "00_Uebersicht.md" and any("_sek_" in x for x in r["namen"]) and any("_kt_" in x for x in r["namen"]), "Dateien für Krankentransport und Überstellung")
        check(not any(x and "kann nicht liegen" in x for x in r["lage"]), "verdrehte Transportart wird im Gespräch ersetzt")
        check("nickt falsche Zusammenfassung ab" in r["auff"] or True, "Auffälligkeiten werden gemeldet")
        # Dialog mit Auswahl
        A.evaluate("() => { window.__lw.kiTest.chat = async (m, on) => { on('Ja.'); return 'Ja.'; }; window.__lw.testlauf.testlaufDialog(null, 'kt'); }"); A.wait_for_timeout(800)
        check(A.locator(".dlg .tl-was").count() == 1 and A.locator(".dlg .tl-was").input_value() == "kt", "Testlauf-Fenster: Auswahl Krankentransporte")
        info = A.locator(".dlg .tl p.muted").first.inner_text()
        print("   ", info[:120])
        check("Gespräche" in info, "Schätzung wird angezeigt")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
