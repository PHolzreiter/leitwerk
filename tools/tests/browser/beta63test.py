# Beta 63 (Paul 17.11.2026, Kleinigkeiten): Treffpunkte am Funk mit dem gebräuchlichen Namen („beim Bühl Center“ statt
# „ALEX“, „SCS“), verstanden auch ohne Ortsangabe („verlegen zum Bühlcenter“), frühere Kettennamen („Merkur“) nur mit Ort.
# Aufruf: python3 beta63test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8963", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1400, "height": 900})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema:'hell', einfuehrung:true})); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8963/?debug&seed=63"); A.wait_for_timeout(2500)

        r = A.evaluate("""() => { const L = window.__lw; const F = L.funkOrte; const pois = L.store.list('pois');
            const alex = pois.find((p) => p.id === 'poi-w35214130'); const scs = pois.find((p) => p.id === 'poi-w23087411');
            const merkur = pois.find((p) => p.ort === 'Krems an der Donau' && /Merkur/.test(p.sprechname || ''));
            const krems = { lat: 48.4105, lon: 15.6100 };
            const z = (t, n) => { const x = F.zielImText(t, n || krems); return x ? { funk: x.funk, wohin: x.wohin, label: x.label } : null; };
            return { alex: alex && { name: alex.name, sp: alex.sprechname, n: F.sprechNamen(alex) }, anzahl: pois.filter((p) => p.sprechname).length,
              treff: alex && F.treffpunktWort(alex), stand: alex && F.standortText({ lat: alex.lat + 0.0003, lon: alex.lon }),
              treffScs: scs && F.treffpunktWort(scs),
              zuBuehl: z('verlegen zum Bühlcenter'), zuBuehl2: z('Standort wechseln zum Bühl Center'), zuAlex: z('verlegen zum ALEX Krems'),
              zuScs: z('verlegen zur SCS', { lat: 48.11, lon: 16.31 }), merkurOhne: z('verlegen zum Merkur'), merkurKrems: merkur && z('verlegen nach Krems zum Merkur'),
              merkurName: merkur && merkur.name, normal: z('verlegen nach Gföhl') }; }""")
        print("    ", json.dumps(r, ensure_ascii=False))
        check(r["alex"] and r["alex"]["name"] == "ALEX" and r["alex"]["n"]["gesagt"] == "Bühl Center", "Daten: ALEX hat den Sprechnamen „Bühl Center“")
        check(r["anzahl"] >= 50, f"Sprechnamen aus OpenStreetMap in den Orten ({r['anzahl']})")
        check(r["treff"] == "beim Bühl Center", f"Treffpunkt am Funk: „beim Bühl Center“ ({r['treff']})")
        check("Bühl Center" in (r["stand"] or "") and "ALEX" not in (r["stand"] or ""), f"Standort am Funk mit Sprechnamen ({r['stand']})")
        check(r["treffScs"] == "beim SCS", f"SCS ({r['treffScs']})")
        check(r["zuBuehl"] and r["zuBuehl"]["label"].startswith("ALEX") and r["zuBuehl"]["funk"] == "Bühl Center", f"„zum Bühlcenter“ (zusammengeschrieben, ohne Ort) verstanden ({r['zuBuehl']})")
        check(r["zuBuehl2"] and r["zuBuehl2"]["label"].startswith("ALEX") and r["zuBuehl"]["wohin"] == "nach Krems, Bühl Center", f"„zum Bühl Center“ → „nach Krems, Bühl Center“ ({r['zuBuehl2']})")
        check(r["zuAlex"] and r["zuAlex"]["label"].startswith("ALEX"), "neuer Name „ALEX Krems“ wird auch verstanden")
        check(r["zuScs"] and "Vösendorf" in r["zuScs"]["label"], f"„zur SCS“ ({r['zuScs']})")
        check(r["merkurOhne"] is None, "„zum Merkur“ ohne Ort: kein Ziel (gibt es viele)")
        check(r["merkurKrems"] and r["merkurKrems"]["label"].startswith(r["merkurName"]), f"„nach Krems zum Merkur“ → Billa Plus in Krems ({r['merkurKrems']})")
        check(r["normal"] and r["normal"]["funk"] == "Gföhl", "Orte ohne Sprechnamen wie bisher")

        # Spracherkennung: Sprechnamen in der Nähe sind in der Ortsliste
        r = A.evaluate("""async () => { const s = window.__lw.sim; const fz = Object.values(s.state.fahrzeuge).find((f) => /krems/i.test(f.stationName) && f.kategorie === 'RTW');
            const alex = window.__lw.store.list('pois').find((p) => p.id === 'poi-w35214130'); fz.lat = alex.lat; fz.lon = alex.lon; fz.status = 'freiFunk';
            await new Promise((r) => setTimeout(r, 10500)); const l = window.__lw.funk.orteJetzt(); return { buehl: l.includes('Bühl Center'), alexKrems: l.includes('ALEX Krems') }; }""")
        print("    ", r)
        check(r["buehl"] and r["alexKrems"], "Spracherkennung kennt „Bühl Center“ und „ALEX Krems“ in der Nähe")

        # CSV: Spalte „sprechname“ wird gelesen und geschrieben
        r = A.evaluate("""() => window.__lw.store.list('pois').filter((p) => p.sprechname).slice(0, 3).map((p) => [p.name, p.sprechname])""")
        print("    ", r)
        check(len(r) == 3, "Spalte sprechname in den Orten")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
