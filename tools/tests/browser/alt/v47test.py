# v0.47: Einsatzprofile je Ort – Bad ≠ See, Bahnhof ≠ Bushaltestelle ≠ Raststation, Museum ≠ Tierpark
import subprocess, sys, time, re
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8831", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
PROBE = """async ([id, v]) => { const L = window.__lw; const s = L.sim; const e = await s.probeFall(id, v); if (!e) return null; const sz = e.wahr.abfrage?.szenario;
  return { kat: sz?.ortKat ?? null, stelle: sz?.stelle ?? '', rolle: e.wahr.abfrage?.anrufer?.rolle ?? '', typ: e.wahr.abfrage?.anrufer?.typ ?? '', adr: e.wahr.adresse, partner: s.partnerBedarf(e).map(x => x.art).sort() }; }"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8831/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        A.evaluate("() => { window.__lw.sim.state.zeit = new Date('2026-07-14T10:00').getTime(); }")  # Dienstag im Sommer: alles offen
        def probe(fid, v, n=8):
            return [A.evaluate(PROBE, [fid, v]) for _ in range(n)]
        r = probe("freibad_kopfsprung", "B")
        check(all(x and x["kat"] in ("freibad", "hallenbad") and "wasser" not in x["partner"] for x in r), f"Freibad: an einem Bad, keine Wasserrettung ({[(x['kat'], x['partner'], x['typ']) for x in r]})")
        check(any(x["typ"] == "bademeister" for x in r) and all(re.search("becken|bad", x["stelle"], re.I) for x in r), f"Freibad: Bademeister ruft an, Stelle am Becken ({[x['stelle'] for x in r]})")
        r = probe("see_untergegangen", "A")
        check(all(x and "wasser" in x["partner"] and "fw" in x["partner"] for x in r), f"Offenes Gewässer: Wasserrettung und Feuerwehr ({[(x['kat'], x['partner']) for x in r]})")
        check(all(x["typ"] != "bademeister" for x in r), f"am See kein Bademeister ({[x['typ'] for x in r]})")
        r = probe("therme_kollaps", "A")
        check(all(x and x["kat"] in ("therme", "hallenbad") and "wasser" not in x["partner"] for x in r), f"Therme: kein Wasserrettung ({[(x['kat'], x['typ']) for x in r]})")
        r = probe("bahnhof_stiege", "A")
        check(all(x and x["kat"] == "bahnhof" for x in r) and any(x["typ"] == "bahnpersonal" or x["typ"] == "passant" for x in r), f"Bahnhof ({[(x['kat'], x['typ'], x['adr'][:40]) for x in r]})")
        r = probe("bus_krampf", "A")
        check(all(x and x["kat"] != "bushaltestelle" for x in r) and all(x["typ"] in ("busfahrer", "passant") for x in r), f"Krampf im Bus: auf der Straße, Busfahrer oder Passant ({[(x['kat'], x['typ'], x['stelle']) for x in r]})")
        # Raststation: es gibt keine im Test-Gebiet (Krems) – der Fall kommt dort von selbst nicht
        n = A.evaluate("async () => { const s = window.__lw.sim; let n = 0; for (let i = 0; i < 40; i++) { const e = await s.generiere(['stabil','dringend','kritisch'][i % 3]); if (e?.wahr.abfrage?.szenario?.vorlage === 'rast_lkw_brust' && e.wahr.abfrage.szenario.ortKat !== 'raststation') n++; } return n; }")
        check(n == 0, f"Raststations-Fall nur, wo es eine Raststation gibt ({n} falsch)")
        r = probe("tierpark_biss", "A")
        check(all(x and x["kat"] == "tierpark" for x in r) and any(x["typ"] == "tierpfleger" for x in r), f"Tierpark mit Tierpfleger ({[(x['typ'], x['adr'][:40]) for x in r]})")
        r = probe("museum_sturz", "A")
        check(all(x and x["kat"] == "museum" for x in r) and any(x["typ"] == "aufsicht" for x in r), f"Museum mit Aufsicht ({[(x['typ'], x['rolle'][:25]) for x in r]})")
        r = A.evaluate("() => window.__lw.store.list('pois').length")
        check(r > 9000, f"Orte in ganz NÖ ({r})")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
