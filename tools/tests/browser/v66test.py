# v0.66: NÖ-01, NÖ-02, NÖ-04 spielbar, neue Fahrzeuge, Dienstplan mit Kalenderwochen und Saison
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8866", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_page(viewport={"width": 1600, "height": 950}); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8866/?debug&start"); A.wait_for_timeout(3500)
        opts = A.evaluate("() => [...document.querySelectorAll('.st-fg-sel option')].map(o => o.textContent)")
        check(len(opts) == 6 and not any("bald" in o for o in opts), f"alle 6 Funkgruppen wählbar {opts}")
        # Dienstplan-Text
        d = A.evaluate("""() => { const D = window.__lw.dienst; const r = D.planLesen('Nov–Apr täglich 09:00–16:30; gerade KW Mo–Fr 06:00–14:00; ungerade KW Sa, So 07:00–19:00');
          return { fehler: r.fehler ?? null, plan: r.plan, text: D.planText(r.plan), kw44: D.kalenderwoche(new Date('2026-10-26T08:00:00')), kw45: D.kalenderwoche(new Date('2026-11-02T08:00:00')), kw1: D.kalenderwoche(new Date('2027-01-04T08:00:00')) }; }""")
        print("   ", d)
        check(not d["fehler"] and d["plan"][0]["monate"] == [11, 12, 1, 2, 3, 4] and d["plan"][1]["kw"] == "gerade" and d["plan"][2]["kw"] == "ungerade", "Dienstplan versteht Monate und Kalenderwochen")
        check(d["text"] == "Nov–Apr täglich 09:00–16:30; gerade KW Mo–Fr 06:00–14:00; ungerade KW Sa, So 07:00–19:00", f"… und schreibt sie wieder: {d['text']}")
        check(d["kw44"] == 44 and d["kw45"] == 45 and d["kw1"] == 1, f"Kalenderwochen nach ISO {d['kw44']}, {d['kw45']}, {d['kw1']}")
        # Spiel in NÖ-02
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.funkgruppe = 'NÖ-02'; st.generatorAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("() => window.__lw.sim.call('neuesSpiel', new Date('2026-10-26T08:00:00').getTime())"); A.wait_for_timeout(1200)
        A.evaluate("() => window.__lw.sim.call('pause')")
        r = A.evaluate("""() => { const s = window.__lw.sim, D = window.__lw.dienst; const f = (n) => Object.values(s.state.fahrzeuge).find(x => x.funkrufname === n);
          const da = (n, t) => { const x = f(n); return x ? s.imDienstUm(x, new Date(t).getTime()) : null; };
          const z = {}; for (const x of Object.values(s.state.fahrzeuge)) { const k = x.funkrufname.slice(0, 3); z[k] = (z[k] ?? 0) + 1; }
          return { z, geradeMo: da('55/014', '2026-10-26T08:00:00'), ungeradeMo: da('55/014', '2026-11-02T08:00:00'), umgekehrt: [da('55/051', '2026-10-26T08:00:00'), da('55/051', '2026-11-02T08:00:00')],
            hochkar: [da('68/017', '2026-07-15T10:00:00'), da('68/017', '2027-01-15T10:00:00')],
            raabs: [!!f('70/199'), !!f('70/499')], geras: f('58/002')?.rmTyp, gg: s.dienstplanVon(f('72/399')?.id).map(x => x.von + '-' + x.bis),
            st: ['Rotes Kreuz Münichreith', 'Rotes Kreuz Winterstützpunkt Hochkar', 'Rotes Kreuz Dienststelle Marchegg', 'Rotes Kreuz Dienststelle Leopoldsdorf/Marchfelde'].map(n => window.__lw.store.list('stations').some(x => x.name === n)),
            plan014: D.planKurz(s.dienstplanVon(f('55/014').id)), litschau: f('55/402')?.rmTyp }; }""")
        print("   ", r)
        z = r["z"]
        check(z.get("55/", 0) >= 15 and z.get("72/", 0) >= 18 and z.get("70/", 0) >= 10 and z.get("58/", 0) >= 10, f"NÖ-02 hat Fahrzeuge (55: {z.get('55/')}, 58: {z.get('58/')}, 70: {z.get('70/')}, 72: {z.get('72/')})")
        check(z.get("51/", 0) >= 20 and z.get("62/", 0) >= 25 and z.get("54/", 0) >= 35 and z.get("63/", 0) >= 25 and z.get("59/", 0) >= 20, "NÖ-01 und NÖ-04 haben Fahrzeuge")
        check(r["geradeMo"] is True and r["ungeradeMo"] is False and r["umgekehrt"] == [False, True], f"KTW nur in geraden bzw. ungeraden Kalenderwochen ({r['plan014']})")
        check(r["hochkar"] == [False, True], "RTW Hochkar nur im Winter")
        check(r["raabs"] == [True, False] and r["geras"] == "RTW-C" and r["gg"] == ["17:00-06:00"], f"Korrekturen: NEF Raabs 70/199, Geras RTW-C, NEF Groß Gerungs 17–06 {r['gg']}")
        check(all(r["st"]), f"neue Dienststellen {r['st']}")
        check(r["litschau"] == "RTW-C", "Litschau RTW-C")
        # Einsätze in den neuen Funkgruppen
        for fg in ["NÖ-01", "NÖ-02", "NÖ-04"]:
            A.evaluate(f"() => {{ const st = structuredClone(window.__lw.store.settings); st.funkgruppe = '{fg}'; st.generatorAktiv = false; window.__lw.store.setSettings(st); }}")
            A.evaluate("() => window.__lw.sim.call('neuesSpiel', new Date('2026-10-27T10:00:00').getTime())"); A.wait_for_timeout(1000)
            e = A.evaluate("""async (fg) => { const s = window.__lw.sim; await s.call('pause'); const out = [];
              for (let i = 0; i < 4; i++) { const e = await s.generiere(); if (e) out.push(e); }
              const g = s.funkgruppe(); const imGebiet = out.filter(e => window.__lw.store && true).length;
              const vor = []; for (const e of out.slice(0, 2)) { e.adresse = { lat: e.wahr.lat, lon: e.wahr.lon, label: 'x' }; const v = await s.vorschlaege(e.id); vor.push(v.filter(x => x.sekunden !== null).slice(0, 3).map(x => x.fz.funkrufname)); }
              return { n: out.length, fg: s.funkgruppe().id, vor }; }""", fg)
            print("   ", fg, e)
            check(e["n"] >= 3 and e["fg"] == fg and all(len(v) > 0 for v in e["vor"]), f"{fg}: Einsätze und Vorschläge {e['vor']}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
