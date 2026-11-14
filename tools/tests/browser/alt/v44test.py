# v0.44: unabhängige fremde Schemas – Umgedrehtes, Zusammengesetztes, Stufen, Fälle
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8828", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
FAELLE = """async () => { const L = window.__lw; const s = L.sim; const out = {};
  for (const f of L.faelle.alleFaelle()) for (const v of f.varianten) { const e = await s.probeFall(f.id, v.id); const k = e && L.kontext(e);
    out[f.id + '/' + v.id] = { code: e?.wahr.code ?? null, prompt: !!(k && L.systemPrompt(k)), a: e?.wahr.abfrage?.antworten ?? {}, stufe: e ? s.stufeDef(L.store.schema.codes[e.wahr.code]?.kategorie ?? '')?.kategorie : null }; }
  return out; }"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.add_init_script("try { localStorage.setItem('lw.abfrageAnsicht','klassisch') } catch (e) {}")
        A.goto("http://localhost:8828/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        # Schema 1: Leitstellen-Jargon, Stufen ohne „kategorie“
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/unabh_1.json')).json())"); A.wait_for_timeout(800)
        r = A.evaluate("""() => { const L = window.__lw; const u = L.store.uebersetzung; const z = (id) => u.zuordnung.find(x => x.frage === id) || {};
          return { na: z('NICHT_ANSPR'), atm: z('ATM_UNAUF'), stufen: Object.fromEntries(['Stufe D','Stufe C','Stufe A','K'].map(k => [k, L.sim.stufeDef(k)?.kategorie])) }; }""")
        check(r["na"]["merkmal"] == "bw" and r["na"]["werte"] == {"J": "nein", "N": "ja", "EINGESCHR": "getruebt", "UNK": "unbekannt"}, "„nicht ansprechbar?“ mit „Nein, aber verwirrt“ richtig zugeordnet")
        check(r["atm"]["werte"].get("SCHNAPP") == "agonal" and r["atm"]["werte"].get("KEINE") == "keine" and r["atm"]["werte"].get("ERSCHW") == "abnorm", "Atmung mit mehreren „Nein – …“-Antworten")
        check(r["stufen"] == {"Stufe D": "kritisch", "Stufe C": "dringend", "Stufe A": "stabil", "K": "stabil"}, f"Einsatzstufen ohne „kategorie“ abgeleitet ({r['stufen']})")
        res = A.evaluate(FAELLE)
        check(all(x["code"] and x["prompt"] for x in res.values()), f"Schema 1: alle {len(res)} Fälle mit Code und Anrufer")
        check(res["kreislaufstillstand/rea"]["stufe"] == "kritisch" and res["brustschmerz/A"]["stufe"] == "kritisch", "Reanimation und Brustschmerz kritisch")
        check(res["schnittwunde/A"]["stufe"] != "kritisch", "kleine Schnittwunde nicht kritisch")
        # Schema 2: Laiensprache, zusammengesetzte Fragen
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/unabh_2.json')).json())"); A.wait_for_timeout(800)
        r = A.evaluate("() => (window.__lw.store.uebersetzung.zuordnung.find(x => x.frage === 'kritisch_check') || {}).teile")
        check(r and sorted(t["merkmal"] for t in r) == ["at", "bw"], f"„bewusstlos oder atmet nicht normal?“ = Bewusstsein + Atmung ({r})")
        res = A.evaluate(FAELLE)
        check(all(x["code"] and x["prompt"] for x in res.values()), f"Schema 2: alle {len(res)} Fälle mit Code und Anrufer")
        kc = lambda k: res[k]["a"].get("kritisch_check")
        check(kc("kreislaufstillstand/rea") == "ja" and kc("brustschmerz/0") == "nein", f"zusammengesetzte Antwort aus der Wahrheit berechnet ({kc('kreislaufstillstand/rea')}, {kc('brustschmerz/0')})")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
