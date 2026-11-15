# Beta 55 (Paul 15.11.2026): „außer Dienst“ ist dasselbe wie „Abgemeldet“ (Neues Spiel ließ außer Dienst mit „Frei auf
# Wache“ stehen); Treffpunkte/Standort: kleine Ortschaften ja („in Schönberg“), größere Orte wie Krems nur mit Straße
# bzw. Merkmal, Freiland mit Straße („auf der B37 zwischen …“).
# Aufruf: python3 beta55test.py <arbeitsordner> <web-build>
import subprocess, sys, time
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8957", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1500, "height": 900})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema:'hell', einfuehrung:true})); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8957/?debug&seed=55"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1000)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; window.__lw.store.setSettings(st); }")

        # ---- außer Dienst = Abgemeldet: nach „Neues Spiel“ und bei älteren Spielständen
        r = A.evaluate("""() => { const s = window.__lw.sim; const l = () => Object.values(s.state.fahrzeuge);
            const vor = l().filter((f) => f.ausserDienst).length;
            s.neuesSpiel(s.state.zeit + 7 * 3600000); s.pause();
            const falsch1 = l().filter((f) => f.ausserDienst && f.status !== 'abgemeldet').map((f) => f.funkrufname);
            const ad = l().filter((f) => f.ausserDienst).length;
            // älterer Spielstand: außer Dienst, aber „Frei auf Wache“
            const x = l().find((f) => f.ausserDienst && !f.ersatzFuer && !f.kt); x.status = 'freiWache';
            s.dienstTick(s.state.zeit, true);
            return { vor, ad, falsch1, x: x.status }; }""")
        print("    ", {k: (v if not isinstance(v, list) else v[:5]) for k, v in r.items()})
        check(r["ad"] > 0 and not r["falsch1"], "nach „Neues Spiel“: alle Fahrzeuge außer Dienst stehen auf „Abgemeldet“")
        check(r["x"] == "abgemeldet", "älterer Spielstand (außer Dienst, Frei auf Wache) wird abgemeldet")
        html = A.evaluate("() => document.body.innerText")
        check("außer Dienst" not in html, "keine eigene Marke „außer Dienst“ in der Oberfläche")

        # ---- Treffpunkte / Standort
        A.evaluate("async () => { await window.__lw.sim.generiere('dringend'); }")
        r = A.evaluate("""async () => { const s = window.__lw.sim;
            const krems = { lat: 48.4106, lon: 15.6103 }, schoenberg = { lat: 48.5213, lon: 15.6953 }, b37 = { lat: 48.53175, lon: 15.41096 }, sport = { lat: 48.396745, lon: 15.585355 };
            return { krems: s.treffpunktName(krems, krems), schoenberg: s.treffpunktName(schoenberg, schoenberg), b37: s.treffpunktName(b37, b37), sport: s.treffpunktName(sport, sport),
                     standortKrems: s.standortText ? null : null }; }""")
        print("    ", r)
        check(r["sport"] == "beim Sportplatz Mautern", "POI in der Nähe: „beim Sportplatz Mautern“")
        check(r["krems"] not in ("in Krems", "bei Krems") and "Krems" in r["krems"] or r["krems"].startswith("beim "), f"größerer Ort: nicht nur „in Krems“ ({r['krems']})")
        check(r["schoenberg"] in ("in Schönberg",) or r["schoenberg"].startswith("beim "), f"kleine Ortschaft: „in Schönberg“ ({r['schoenberg']})")
        check(r["b37"].startswith("auf der B37"), f"Freiland: „auf der B37 …“ ({r['b37']})")

        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
