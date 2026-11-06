import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8797", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(c, m):
    global fails
    print(("OK     " if c else "FEHLER ") + m)
    if not c: fails += 1
INIT = "(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1500, "height": 950}); ctx.add_init_script(INIT)
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8797/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        r = A.evaluate("""async () => { const s = window.__lw.sim; const w = (ms) => new Promise(r => setTimeout(r, ms)); s.settings.generatorAktiv = false; s.state.laeuft = true; s.funkFestNach = 1000;
          const heli = Object.values(s.state.fahrzeuge).find(f => f.funkrufname === '99/002'); const rtw = Object.values(s.state.fahrzeuge).find(f => f.funkrufname === '75/001');
          const e = await s.probeFall('brustschmerz', '0'); s.state.einsaetze.push(e); e.fahrzeuge.push(heli.id, rtw.id); heli.einsatzId = e.id; rtw.einsatzId = e.id; rtw.phase = 'vorOrt';
          const ich = s.wer(); heli.pilot = { pid: ich.pid, name: ich.name };
          const frei = async () => { for (let i = 0; i < 80 && s.funkKanalSpricht(null); i++) await w(150); };
          s.funkMenschText(null, '75/001 von C2, kommen'); await w(4000); await frei();
          const g = s.state.funkGespraeche.find(x => x.mensch && x.an && x.an.fzId === rtw.id);
          s.funkMenschText(null, 'wo können wir landen, kommen'); await w(3500); await frei();
          s.funkMenschText(null, 'LEO von C2, kommen'); await w(500);
          const leo = s.state.funkGespraeche.find(x => x.mensch && !x.an && x.fzId === heli.id);
          await frei(); s.funkSchliessen && leo && s.funkSchliessen(leo);
          let fehler = ''; try { s.funkMenschText(null, '75/004 von C2, kommen'); } catch (e) { fehler = e.message; }
          const r4 = Object.values(s.state.fahrzeuge).find(f => f.funkrufname === '75/004');
          const g4 = s.state.funkGespraeche.find(x => x.mensch && x.an && x.an.fzId === r4.id && x.status !== 'ende');
          return { rtw: g && g.sprueche.map(x => x.von + ': ' + x.text), leo: leo && leo.sprueche.map(x => x.von + ': ' + x.text), fehler, g4: !!g4 }; }""")
        print("  ", json.dumps(r, ensure_ascii=False)[:900])
        check(r["rtw"] and len(r["rtw"]) >= 4 and any("Landemöglichkeit" in x for x in r["rtw"]), "Pilot: „75/001 von C2“ geht an den RTW, danach ohne Rufnamen weiter (Landeplatz-Antwort)")
        check(r["leo"] and r["leo"][0].endswith("LEO von C2, kommen"), "Pilot: „LEO von C2“ geht an die Leitstelle")
        check(not r["fehler"] and r["g4"], f"Fahrzeug ohne gemeinsamen Einsatz: Gespräch statt Fehler ({r['fehler']})")
        check(not logs, f"keine Seitenfehler {logs[:2]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
