# Beta 79 (Paul 24.11.2026): Ticket 17 – falsche Adresse ohne Häufungen (nach einer falschen Adresse erst einige
# richtige, im Schnitt trotzdem so oft wie eingestellt); Ticket 16 – Mithelfen hat einen Reiter „Fehler/Problem“.
# Aufruf: python3 beta79test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8979", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1500, "height": 950})
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        gesendet = []
        def ticket(route):
            try: gesendet.append(json.loads(route.request.post_data or "{}"))
            except Exception: gesendet.append({})
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"nr": 979, "geheim": "t", "status": "eingegangen"}))
        ctx.route("https://tickets.leitwerk.workers.dev/api/tickets", ticket)
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8979/?debug&seed=8979"); A.wait_for_timeout(2500)

        # 1) Ticket 17: Häufigkeit und Häufungen
        r = A.evaluate("""() => { const F = window.__lw.falscheAdresse; const out = {};
          for (const pz of [0, 5, 15, 30, 50, 100]) {
            let seit = Infinity, n = 0, falsch = 0, maxIn6 = 0, abstandMin = Infinity, letzte = -1; const fenster = [];
            for (let i = 0; i < 200000; i++) {
              const f = F.ziehen(pz, seit); n++;
              if (f) { falsch++; if (letzte >= 0) abstandMin = Math.min(abstandMin, i - letzte); letzte = i; seit = 0; } else seit++;
              fenster.push(f ? 1 : 0); if (fenster.length > 6) fenster.shift();
              maxIn6 = Math.max(maxIn6, fenster.reduce((a, b) => a + b, 0));
            }
            out[pz] = { anteil: falsch / n * 100, maxIn6, abstandMin, sperre: F.sperre(pz) };
          }
          return out; }""")
        for pz, v in r.items():
            ziel = float(pz)
            check(abs(v["anteil"] - ziel) < 0.6, f"{pz} % eingestellt → {v['anteil']:.2f} % falsche Adressen (Sperre {v['sperre']})")
        check(r["15"]["maxIn6"] <= 2 and r["15"]["abstandMin"] >= 4, f"15 %: nie mehr als 2 von 6, mindestens 3 richtige dazwischen (max {r['15']['maxIn6']}, Abstand {r['15']['abstandMin']})")
        check(r["5"]["abstandMin"] >= 4 and r["30"]["abstandMin"] >= 2, f"Sperre auch bei 5 % und 30 % ({r['5']['abstandMin']}, {r['30']['abstandMin']})")

        # 2) im Spiel: Engine zählt mit
        g = A.evaluate("""async () => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false });
          await window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json());
          s.settings.falscheAdresseProzent = 100; s.seitFalscherAdresse = 0; const erg = [];
          for (let i = 0; i < 6; i++) { const e = await s.generiere(); erg.push(e ? !!e.meldung?.adresseFalsch : null); }
          return { erg, seit: s.seitFalscherAdresse }; }""")
        print("   ", g)
        e = [x for x in g["erg"] if x is not None]
        hinten = 0
        for x in reversed(e):
            if x: break
            hinten += 1
        check(len(e) >= 4 and 1 <= g["seit"] <= 6, f"im Spiel: Zähler seit der letzten falschen Adresse zählt mit ({g['erg']}, seit {g['seit']})")

        # 3) Ticket 16: Reiter Fehler/Problem
        A.evaluate("() => window.__lw.mithelfen({ reiter: 'fehler' })"); A.wait_for_timeout(600)
        reiter = A.evaluate("() => [...document.querySelectorAll('.mh-reiter-b')].map(b => b.textContent + (b.classList.contains('aktiv') ? '*' : ''))")
        check("Fehler/Problem*" in reiter, f"Reiter „Fehler/Problem“ da und offen ({reiter})")
        hat = A.evaluate("() => ({ titel: !!document.querySelector('.mh-form input[name=titel]'), bericht: document.querySelector('.mh-form input[name=bericht]')?.checked, ph: document.querySelector('.mh textarea[name=text]')?.placeholder })")
        check(hat["titel"] and hat["bericht"] is True and "Was ist passiert" in (hat["ph"] or ""), f"Formular: Titel, Häkchen Fehlerbericht (an), passender Hinweis ({hat})")
        A.click(".dlg-foot .btn.primary"); A.wait_for_timeout(400)
        check(not gesendet, "ohne Titel wird nichts geschickt")
        A.fill(".mh-form input[name=titel]", "Fahrzeug fährt nicht los")
        A.fill(".mh textarea[name=text]", "RTW bleibt auf der Wache stehen.")
        A.click(".dlg-foot .btn.primary")
        for _ in range(40):
            if gesendet: break
            A.wait_for_timeout(250)
        t = gesendet[-1] if gesendet else {}
        namen = [a.get("name") for a in t.get("anhaenge", [])]
        check(t.get("art") == "fehler" and t.get("titel", "").startswith("Fehler: Fahrzeug fährt nicht los") and "fehlerbericht.md" in namen, f"mit Bericht: Ticket art=fehler, Titel, Anhänge {namen}")
        A.wait_for_timeout(500)
        # ohne Bericht
        A.evaluate("() => window.__lw.mithelfen({ reiter: 'fehler' })"); A.wait_for_timeout(600)
        A.fill(".mh-form input[name=titel]", "Text abgeschnitten")
        A.fill(".mh textarea[name=text]", "Im Einsatzfenster.")
        A.uncheck(".mh-form input[name=bericht]")
        n0 = len(gesendet); A.click(".dlg-foot .btn.primary")
        for _ in range(40):
            if len(gesendet) > n0: break
            A.wait_for_timeout(250)
        t = gesendet[-1] if len(gesendet) > n0 else {}
        check(t.get("art") == "fehler" and t.get("titel") == "Fehler: Text abgeschnitten" and not t.get("anhaenge"), f"ohne Bericht: nur Text ({t.get('titel')}, {t.get('anhaenge')})")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
