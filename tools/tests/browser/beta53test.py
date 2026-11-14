# Beta 53 (Paul 14.11.2026): eigene Statusfarben überall (CSS der Fenster + statusDef für Karte/Pilot/Tablet),
# Orte aller Dienststellen, Pilot funkt in RD-NOE-09/10 ohne Großeinsatz → deutlicher Hinweis (Umschalten bleibt frei),
# Alter realistisch (Anrufer, die den Patienten nicht kennen, schätzen ±3–5 Jahre; Besatzung kennt das echte),
# fester Zufall in Tests (?debug&seed=N).
# Aufruf: python3 beta53test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8953", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

PERS = {"thema": "hell", "einfuehrung": True, "statusFarben": {"amBO": "#123456"}}
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify(" + json.dumps(PERS) + ")); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8953/?debug&seed=21"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; st.acnAktiv = false; st.tempoBeiNotruf = false; window.__lw.store.setSettings(st); window.__lw.sim.setWetter('klar'); }")

        # ---- 1) eigene Statusfarbe: CSS-Variable der Fenster und statusDef (Karte, Pilot, Tablet)
        r = A.evaluate("""() => { const s = window.__lw.sim; const css = getComputedStyle(document.documentElement);
            const ap = document.querySelector('.ap'); const cssAp = ap ? getComputedStyle(ap).getPropertyValue('--s3').trim() : null;
            return { root: css.getPropertyValue('--s3').trim().toLowerCase(), ap: cssAp && cssAp.toLowerCase(), def: (s.statusDef('amBO').farbe || '').toLowerCase(),
              frei: (s.statusDef('freiWache').farbe || '').toLowerCase(), s1: css.getPropertyValue('--s1').trim().toLowerCase() }; }""")
        print("    ", r)
        check(r["root"] == "#123456" and r["def"] == "#123456", "eigene Farbe für Status 3 gilt in CSS (--s3) und statusDef")
        check(r["ap"] in (None, "#123456"), "auch in den neuen Fenstern (.ap) überschrieben")
        check(r["frei"] == r["s1"] and r["frei"] != "#123456", "andere Status behalten ihre Farbe (statusDef = CSS)")
        r = A.evaluate("""async () => { const raw = JSON.parse(localStorage.getItem('leitwerk.persoenlich')); raw.statusFarben = {}; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(raw)); return true; }""")

        # ---- 2) Orte aller Dienststellen
        r = A.evaluate("""() => { const l = window.__lw.store.list('stations'); const ohne = l.filter((x) => !String(x.ort || '').trim()).map((x) => x.id + ' ' + x.name);
            const alt = l.filter((x) => /notruf n/i.test(x.name + ' ' + (x.organisation || ''))).map((x) => x.name); return { n: l.length, ohne, alt }; }""")
        print("    ", r["n"], r["ohne"][:5], r["alt"][:3])
        check(r["n"] > 100 and not r["ohne"], f"alle Dienststellen haben einen Ort ({len(r['ohne'])} ohne)")
        check(not r["alt"], "keine alten Organisationsnamen in den Dienststellen")

        # ---- 3) Pilot funkt in RD-NOE-09 ohne Großeinsatz → Hinweis; mit Großeinsatz nicht
        x = A.evaluate("""async () => { const s = window.__lw.sim; const d = new Date(s.state.zeit); d.setHours(10, 0, 0, 0); s.state.zeit = d.getTime();
            s.funkFestNach = 600; s.settings.rate = 0;
            const heli = Object.values(s.state.fahrzeuge).filter((f) => f.kategorie === 'NAH' && s.verfuegbar(f) && !f.einsatzId)[0];
            s.pilotUebernehmen(heli.id); return { heli: heli.id, name: s.rufname(heli), gs: s.gsGruppeAktiv('gs'), eigen: s.gsGruppeAktiv(null) }; }""")
        check(x["gs"] is False and x["eigen"] is True, "ohne Großeinsatz: RD-NOE-09 nicht in Betrieb, eigene Gruppe immer")
        r = A.evaluate("""async (x) => { const s = window.__lw.sim; const zaehl = () => JSON.stringify(s.state).split('dort läuft kein Großeinsatz').length - 1;
            const vor = zaehl(); s.funkMenschText(null, 'Hier ' + x.name + ', kommen', 'gs'); await new Promise((r) => setTimeout(r, 300));
            const nach = zaehl(); s.funkMenschText(null, 'Hier ' + x.name + ', kommen', 'gs'); await new Promise((r) => setTimeout(r, 300));
            return { vor, nach, dritte: zaehl() }; }""", x)
        print("    ", r)
        check(r["nach"] > r["vor"], "Pilot funkt in RD-NOE-09 ohne Großeinsatz → Hinweis „kein Großeinsatz“ im Funk")
        check(r["dritte"] == r["nach"], "Hinweis höchstens einmal pro Minute")

        # ---- 4) Alter realistisch: Besatzung kennt das echte Alter, Anrufer ohne Bezug schätzt ±3–5 Jahre
        r = A.evaluate("""async () => { const s = window.__lw.sim; const kennt = new Set(['partner','kind','eltern','fern','pflege','arzt','ordi','lehrer','aerztefunk','hotline']);
            const out = { n: 0, genau: 0, geschaetzt: 0, falsch: [] };
            for (let i = 0; i < 60 && out.n < 40; i++) {
              const e = await s.generiere(['stabil', 'dringend', 'kritisch'][i % 3]); const ab = e.wahr.abfrage; const pat = e.wahr.lage?.patienten;
              if (!ab || !pat || pat.length !== 1 || typeof ab.antworten.alter !== 'number') { e.zustand = 'abgeschlossen'; if (e.anruf) e.anruf.status = 'beendet'; continue; }
              out.n++; const echt = pat[0].alter, sagt = ab.antworten.alter, an = ab.anrufer || {};
              const muss = echt < 18 || an.selbst || kennt.has(an.typ);
              const seite = [18, 35, 65].every((g) => (echt >= g) === (sagt >= g));
              if (muss) { if (sagt === echt) out.genau++; else out.falsch.push(['genau', an.typ, echt, sagt]); }
              else if (Math.abs(sagt - echt) >= 0 && Math.abs(sagt - echt) <= 5 && seite) out.geschaetzt += sagt !== echt ? 1 : 0;
              else out.falsch.push(['schätzt', an.typ, echt, sagt]);
              e.zustand = 'abgeschlossen'; if (e.anruf) e.anruf.status = 'beendet';
            }
            return out; }""")
        print("    ", r)
        check(r["n"] >= 20 and not r["falsch"], f"Alter: Angehörige/Patient selbst/Kinder genau, sonst höchstens 5 Jahre daneben und gleiche Altersgruppe ({r['n']} Fälle)")
        check(r["geschaetzt"] >= 1, f"Anrufer ohne Bezug schätzen tatsächlich ({r['geschaetzt']}×)")

        # ---- 5) fester Zufall: gleicher Seed → gleiche Folge
        r = A.evaluate("() => ({ seed: window.__lwSeed, nativ: /native code/.test(String(Math.random)) })")
        check(r["seed"] == 21 and not r["nativ"], f"fester Zufall mit ?debug&seed=21 aktiv ({r})")

        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
