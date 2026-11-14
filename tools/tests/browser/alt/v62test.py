# v0.62: NÖ-05 und NÖ-06 spielbar mit RTW/KTW/BEL/NEF und neuen Dienststellen
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8859", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_page(viewport={"width": 1600, "height": 950}); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8859/?debug&start"); A.wait_for_timeout(3500)
        opt = A.evaluate("() => [...document.querySelectorAll('.st-fg-sel option')].filter(o => !o.disabled).map(o => o.value)")
        check(opt == ["NÖ-01", "NÖ-02", "NÖ-03", "NÖ-04", "NÖ-05", "NÖ-06"], f"auf der Startseite wählbar: {opt}")
        A.evaluate("() => window.__lw.codesystemLaden(null)") if False else None
        d = A.evaluate("""() => { const s = window.__lw.store; const fz = s.list('vehicles'); const st = new Map(s.list('stations').map(x => [x.id, x]));
          const k = (p) => fz.filter(v => v.funkrufname.startsWith(p));
          const zaehl = (p) => { const l = k(p); const c = {}; for (const v of l) c[v.kategorie] = (c[v.kategorie]||0)+1; return c; };
          const ohnePlan = fz.filter(v => /^(52|53|64|65|71|74|77)\\//.test(v.funkrufname) && v.dienstplan === undefined).map(v => v.funkrufname);
          return { baden: zaehl('52/'), wrn: zaehl('74/'), modl: zaehl('64/'), apn: fz.find(v => v.funkrufname === 'APN1') ? st.get(fz.find(v => v.funkrufname === 'APN1').dienststelleId)?.name : null,
            smd: fz.filter(v => /^65\\/5/.test(v.funkrufname)).map(v => st.get(v.dienststelleId)?.name), asb: fz.filter(v => /^74\\/38/.test(v.funkrufname)).map(v => st.get(v.dienststelleId)?.name),
            himberg: st.get(fz.find(v => v.funkrufname === '77/050')?.dienststelleId)?.name, nef: ['53/699','65/098'].map(f => !!fz.find(v => v.funkrufname === f)),
            acn: fz.filter(v => v.kategorie === 'ACN').map(v => v.funkrufname).sort(), ohnePlan, roh: fz.filter(v => /^(52|53|64|65|71|74|77)\\//.test(v.funkrufname)).length }; }""")
        print("   ", d)
        check(d["baden"].get("RTW", 0) >= 10 and d["baden"].get("KTW", 0) >= 10, f"Baden mit RTW und KTW: {d['baden']}")
        check(d["wrn"].get("RTW", 0) >= 5, f"Wiener Neustadt: {d['wrn']}")
        check(d["apn"] == "PVZ Wienerwald Breitenfurt", f"APN1 am PVZ Wienerwald: {d['apn']}")
        check(set(d["smd"]) == {"SMD Dienststelle Aspang"} and len(d["smd"]) == 5, f"SMD Aspang: {d['smd']}")
        check(set(d["asb"]) == {"Samariterbund Wiener Neustadt"}, f"ASB Wiener Neustadt: {d['asb']}")
        check(d["himberg"] == "Rotes Kreuz Ortsstelle Himberg", f"Himberg: {d['himberg']}")
        check(all(d["nef"]), "NEF Hainburg 53/699 und Aspang 65/098")
        check("80/008" in d["acn"] and "80/009" not in d["acn"] and "80/001" not in d["acn"] and len(d["acn"]) == 6, f"ACN (eine je Stützpunkt): {d['acn']}")
        # Dienstpläne verstanden?
        plaene = A.evaluate("""() => { const s = window.__lw.store; const l = s.list('vehicles').filter(v => /^(52|53|64|65|71|74|77)\\//.test(v.funkrufname)); return [l.filter(v => v.dienstplan?.length).length, l.length, JSON.stringify(l.find(v => v.funkrufname === '52/119').dienstplan)]; }""")
        check(plaene[0] >= 150, f"Dienstpläne gelesen ({plaene[0]} von {plaene[1]} mit festen Zeiten; BEL Baden {plaene[2]})")
        for fg in ["NÖ-05", "NÖ-06"]:
            A.select_option(".st-fg-sel", fg); A.wait_for_timeout(300)
            A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; window.__lw.store.setSettings(st); }")
            A.click(".st-start"); A.wait_for_timeout(1500)
            r = A.evaluate("""async (fg) => { const s = window.__lw.sim; const ergebnis = [];
              for (let i = 0; i < 6; i++) { s.call('generiere'); }
              await new Promise(r => setTimeout(r, 1500));
              for (const e of s.state.einsaetze.slice(0, 6)) ergebnis.push([+e.wahr.lat.toFixed(3), +e.wahr.lon.toFixed(3)]);
              const imDienst = Object.values(s.state.fahrzeuge).filter(f => /^(52|53|64|65|71|74|77)\\//.test(f.funkrufname) && f.status !== 'abgemeldet' && f.status !== 'aus').length;
              return { n: s.state.einsaetze.length, ergebnis, imDienst, fg: window.__lw.store.settings.funkgruppe }; }""", fg)
            print("   ", fg, r)
            check(r["fg"] == fg and r["n"] >= 4, f"{fg}: Einsätze entstehen ({r['n']})")
            box = {"NÖ-05": (47.9, 48.25, 15.95, 17.2), "NÖ-06": (47.4, 48.1, 15.6, 16.5)}[fg]
            check(all(box[0] < a < box[1] and box[2] < o < box[3] for a, o in r["ergebnis"]), f"{fg}: Einsatzorte in der Region {r['ergebnis']}")
            check(r["imDienst"] >= 30, f"{fg}: Fahrzeuge der Region im Spiel ({r['imDienst']})")
            A.click("#steuerleiste .brand"); A.wait_for_timeout(1200)
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
