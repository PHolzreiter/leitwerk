# v0.51: alle NÖ-NEF, Dienstzeiten, Notarzt-Abholung im Krankenhaus (über Punkt P)
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8836", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8836/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        d = A.evaluate("""() => { const st = window.__lw.store; const v = st.list('vehicles').filter(x => x.kategorie === 'NEF' && !x.ersatzFuer);
          const f = (n) => v.find(x => x.funkrufname === n); const plan = (n) => JSON.stringify(f(n)?.dienstplan ?? []);
          const stName = (n) => st.get('stations', f(n)?.dienststelleId)?.name ?? '';
          return { n: v.length, abhol: v.filter(x => x.naAbholung).map(x => x.funkrufname + '>' + x.naAbholung).sort(),
            poegg: plan('62/699'), raabs: plan('70/199'), aspang: plan('65/098'), raabsSt: stName('70/199'), ggSt: stName('72/399'), gmuend: stName('55/099') }; }""")
        check(d["n"] == 33, f"33 NEF in NÖ (mit APN1) ({d['n']})")
        check(d["abhol"] == sorted(["75/099>kh002", "69/099>kh003", "58/099>kh007", "72/099>kh020", "76/099>kh019", "51/099>kh006"]), f"Notarzt-Abholung genau Krems, Tulln, Horn, Zwettl, Waidhofen/Ybbs, Amstetten ({d['abhol']})")
        check("18" in d["poegg"] and "6" in d["poegg"] and d["aspang"] == "[]", f"Pöggstall nur nachts, Aspang 24 h ({d['poegg']})")
        check(d["raabsSt"].startswith("Ärztefunkdienst 141") and d["ggSt"].startswith("Ärztefunkdienst 141") and "19" in d["raabs"], f"NEF-141 Raabs/Groß Gerungs: 141-Stützpunkt, 19–7 ({d['raabsSt']}, {d['ggSt']}, {d['raabs']})")
        # Ablauf: NEF Krems holt den Notarzt im UK Krems (Punkt P) ab, fährt dann zum Einsatz, bringt ihn danach zurück
        r = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; const st = L.store;
          s.state.zeit = new Date('2026-10-20T10:00').getTime(); s.dienstTick?.(s.state.zeit, true);
          const nef = Object.values(s.state.fahrzeuge).find(f => f.funkrufname === '75/099');
          const kh = st.get('hospitals', 'kh002'); const P = kh.zufahrt.p;
          const ohne = Object.values(s.state.fahrzeuge).find(f => f.funkrufname === '59/099');
          const umweg = [!!s.naUmweg(nef), !!s.naUmweg(ohne)];
          nef.phase = 'frei'; nef.status = 'freiWache'; nef.einsatzId = null; nef.lat = nef.heim.lat; nef.lon = nef.heim.lon; nef.naAnBord = false; nef.ausserDienst = false;
          const e = await s.generiereFall('kollaps', 'A'); e.adresse = { lat: 48.4738, lon: 15.6809, label: 'Hauptplatz Langenlois' };
          s.alarmiere(e.id, [nef.id]);
          const sleep = (ms) => new Promise(r => setTimeout(r, ms));
          const d = (a, b) => Math.hypot((a.lat - b.lat) * 111000, (a.lon - b.lon) * 74000);
          const spur = []; let endeAbhol = null, anBordBeiAnfahrt = null;
          for (let i = 0; i < 30; i++) {
            while (nef.phase === 'routing') await sleep(20);
            if (nef.phase === 'naAbholung' && nef.fahrt) { const c = nef.fahrt.coords.at(-1); endeAbhol = d({ lat: c[1], lon: c[0] }, P); }
            if (nef.phase === 'anfahrt' && anBordBeiAnfahrt === null) anBordBeiAnfahrt = !!nef.naAnBord;
            spur.push(nef.phase);
            if (nef.phase === 'anfahrt' || nef.phaseEnde === null) break;
            s.state.zeit = nef.phaseEnde; s.updateVehicle(nef, s.state.zeit);
          }
          // nach dem Einsatz: Rückfahrt über das KH
          s.state.zeit = nef.phaseEnde ?? s.state.zeit; nef.lat = e.adresse.lat; nef.lon = e.adresse.lon; nef.fahrt = null; nef.phaseEnde = null;
          s.freigeben(nef); while (nef.phase === 'routing') await sleep(20);
          const c1 = nef.fahrt?.coords.at(-1); const rueckZuP = c1 ? d({ lat: c1[1], lon: c1[0] }, P) : null; const zur = !!nef.naZurueck;
          s.state.zeit = nef.phaseEnde; s.updateVehicle(nef, s.state.zeit); while (nef.phase === 'routing') await sleep(20);
          const c2 = nef.fahrt?.coords.at(-1); const dannHeim = c2 ? d({ lat: c2[1], lon: c2[0] }, nef.heim) : null;
          const log = e.protokoll.map(x => x.text).join(' | ');
          return { umweg, spur, endeAbhol, anBordBeiAnfahrt, rueckZuP, zur, dannHeim, naNachher: !!nef.naAnBord, log: log.includes('Notarzt im UK Krems übernommen') }; }""")
        check(r["umweg"] == [True, False], f"Ankunftsschätzung rechnet den Umweg nur beim Abhol-NEF ({r['umweg']})")
        check("naAbholung" in r["spur"] and "naEinstieg" in r["spur"] and r["spur"][-1] == "anfahrt" and r["endeAbhol"] is not None and r["endeAbhol"] < 2, f"NEF Krems: zuerst zum Punkt P, Einstieg, dann Anfahrt ({r['spur']}, Ende {r['endeAbhol']})")
        check(r["anBordBeiAnfahrt"] is True and r["log"], "Notarzt an Bord und im Einsatzprotokoll")
        check(r["zur"] and r["rueckZuP"] is not None and r["rueckZuP"] < 2 and r["dannHeim"] is not None and r["dannHeim"] < 2 and not r["naNachher"], f"Rückfahrt: Notarzt ins KH, dann zur Dienststelle ({r})")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
