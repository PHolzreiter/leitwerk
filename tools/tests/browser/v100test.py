import subprocess, sys, time, json, re
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8793", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(c, m):
    global fails
    print(("OK     " if c else "FEHLER ") + m)
    if not c: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1500, "height": 950})
        ctx.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({einfuehrung: true}))")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8793/?debug"); A.wait_for_timeout(1500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")
        r = A.evaluate("""() => { const s = window.__lw.sim; const F = window.__lw.funk; const nef = Object.values(s.state.fahrzeuge).find(f => /^NEF \\S+$/.test(s.rufname(f)) && !/ÖAMTC/.test(s.rufname(f)));
          const nefN = s.rufname(nef); const ort = nefN.split(' ')[1];
          const kaputt = ort.length >= 5 ? ort.slice(0, -1) + (ort.endsWith('s') ? 'z' : 's') : ort;
          return { nefN, t: [F.funkGlaetten('751 von Leo kommen.'), F.funkGlaetten('fünfundsiebzig eins von Leo, kommen'), F.funkGlaetten('sieben fünf null null eins von Leo'), F.funkGlaetten('Neff ' + kaputt + ' von Leo kommen'), F.funkGlaetten('Christophorus zwei von Leo')],
            hinweis: F.funkHinweis(), aus: F.funkAussprache('Hier 75/001, kommen'), z: F.zahlenAlsZiffern('Es sind zwei Verletzte, einer davon ist zweiundachtzig') }; }""")
        print("  ", json.dumps(r, ensure_ascii=False)[:600])
        check(r["t"][0] == "75/001 von LEO kommen.", "„751 von Leo“ → 75/001 von LEO")
        check(r["t"][1] == "75/001 von LEO, kommen", "„fünfundsiebzig eins“ → 75/001")
        check(r["t"][2] == "75/001 von LEO", "„sieben fünf null null eins“ → 75/001")
        check(r["t"][3] == r["nefN"] + " von LEO kommen", "„Neff <Ort falsch>“ → " + r["nefN"])
        check(r["t"][4].startswith("C2 von LEO") or "C2" not in A.evaluate("() => Object.values(window.__lw.sim.state.fahrzeuge).map(f => window.__lw.sim.rufname(f)).join(',')"), "„Christophorus zwei“ → C2")
        check(not re.search(r"\d/\d", r["hinweis"]) and len(r["hinweis"]) <= 600 and r["hinweis"].endswith("von LEO, kommen. Hier LEO, kommen. Verstanden, Ende."), f"Hinweis für die Erkennung in Sprechform, max. 600 Zeichen ({len(r['hinweis'])})")
        check(r["aus"] == "Hier 75 1, kommen", "Vorlesen: 75/001 → „75 1“")
        check(r["z"] == "Es sind 2 Verletzte, einer davon ist 82", "Zahlwörter → Ziffern")
        # gerade rufendes Fahrzeug bevorzugt (55 1 gehört, 75/001 ruft)
        r = A.evaluate("""async () => { const s = window.__lw.sim; s.settings.generatorAktiv = false; const fz = Object.values(s.state.fahrzeuge).find(f => f.funkrufname === '75/001');
          s.fzRuft(fz, null, 'info', 'Fahrzeug wieder einsatzbereit'); await new Promise(r => setTimeout(r, 600));
          const g = s.state.funkGespraeche.find(x => x.fzId === fz.id); return [g && g.status, window.__lw.funk.funkGlaetten('55 eins von Leo kommen'), window.__lw.funk.funkGlaetten('55 1 von Leo')]; }""")
        print("  ", r)
        check(r[1] == "75/001 von LEO kommen", "ähnlich klingende Nummer → das rufende Fahrzeug")
        # Notruf: Anrufertext mit Ziffern
        A.click(".lw-panel[data-panel=einsatzliste] >> text=+ Test"); A.click(".ctx-menu.test >> text=Notfall"); A.wait_for_timeout(1200)
        A.click(".tel-row.st-klingelt:has-text(\"Notruf 144\") .btn.primary"); A.wait_for_timeout(2000)
        r = A.evaluate("""() => { const s = window.__lw.sim; const e = s.state.einsaetze.find(x => x.anruf && x.anruf.status === 'aktiv'); s.anrufNachricht(e.id, 'anrufer', 'Wir sind zu dritt, zwei sind verletzt, seit zehn Minuten', 'ki'); const g = e.anruf.gespraech; return g[g.length - 1].text; }""")
        check(r == "Wir sind zu dritt, 2 sind verletzt, seit 10 Minuten", f"Anrufer-Text mit Ziffern: {r}")
        # Gemini: Stimmbild verschieden je Anrufer, Auftrag mit Sprechform
        r = A.evaluate("""() => { const F = window.__lw.funk; const a = (n, g) => ({ name: n, geschlecht: g, sprache: 'hochdeutsch' });
          const v = new Set(); for (let i = 0; i < 40; i++) v.add(F.stimmBild(a('Anna Huber ' + i, 'w'), 'E' + i)); return [v.size, F.stimmBild({ ...a('X', 'm'), selbst: true }, 'E1', 85)]; }""")
        print("  ", r)
        check(r[0] >= 35, f"Stimmbild unterscheidet sich ({r[0]}/40 verschieden)")
        check("alt, etwas brüchig" in r[1], "Patient ruft selbst an: Stimme passt zum Alter")
        A.screenshot(path=f"{S}/shots13/v100.png")
        check(not logs, f"keine Seitenfehler {logs[:2]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
