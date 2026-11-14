# v0.43: fremdes Codesystem – Übersetzung, Fälle, Dringlichkeit, Gespräch
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8827", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.add_init_script("try { localStorage.setItem('lw.abfrageAnsicht','klassisch') } catch (e) {}")
        A.goto("http://localhost:8827/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/fremd_a.json')).json())"); A.wait_for_timeout(1000)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        r = A.evaluate("""() => { const u = window.__lw.store.uebersetzung; const z = (id) => u.zuordnung.find(x => x.frage === id) || {};
          return { kompatibel: u.kompatibel, fehlend: u.fehlend, bl: z('q_bl'), atm: z('q_atm'), hoch: z('q_s_hoch'), themen: Object.fromEntries(Object.entries(window.__lw.store.schema.kapitel).map(([k, K]) => [k, K.thema])) }; }""")
        print("   ", r["themen"])
        check(not r["kompatibel"] and r["fehlend"] == [], "fremdes Schema: übersetzt, alle Kern-Merkmale gefunden")
        check(r["bl"]["merkmal"] == "bw" and r["bl"]["umgekehrt"] and r["bl"]["werte"]["J"] == "nein", "„bewusstlos?“ = Bewusstsein, umgedreht")
        check(r["atm"]["werte"] == {"J": "normal", "N": "abnorm", "U": "unbekannt"}, "„atmet normal? nein“ = abnorm")
        check(r["hoch"]["werte"] == {"eben": "boden", "stiege": "treppe", "hoch": "gross", "sehrhoch": "extrem"}, "Sturzhöhe: Antworten zugeordnet")
        check(r["themen"]["S1"] == "sturz" and r["themen"]["K6"] == "bewusstlos" and r["themen"]["R"] == "stillstand", "Kapitel-Themen aus dem Titel erkannt")
        res = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; const out = {};
          for (const f of L.faelle.alleFaelle()) for (const v of f.varianten) { const e = await s.probeFall(f.id, v.id); const k = e && L.kontext(e);
            out[f.id + '/' + v.id] = { code: e?.wahr.code ?? null, stufe: e ? s.stufeDef(L.store.schema.codes[e.wahr.code]?.kategorie ?? '')?.kategorie : null, prompt: !!(k && L.systemPrompt(k)), bw: k?.wahrheit.bw ?? null }; }
          return out; }""")
        check(all(x["code"] and x["prompt"] for x in res.values()), f"alle {len(res)} Katalogfälle: Code und Anrufer")
        check(res["kreislaufstillstand/rea"]["code"] == "NF-R-02" and res["kreislaufstillstand/rea"]["stufe"] == "kritisch", "Reanimation → Stillstand-Code, kritisch")
        check(res["kollaps/A"]["code"] == "NF-K6-01", "bewusstloser Kollaps → K6-01")
        check(res["parkbank/A"]["bw"] == "getruebt" and res["parkbank/A"]["code"] == "NF-K6-04", "getrübt bei „bewusstlos?“ → nicht bewusstlos (Anrufer weiß: getrübt)")
        check(res["sturz_huefte/A"]["code"] == "NF-S1-05", "Hüfte: Fehlstellung")
        check(res["vu_eingeklemmt/A"]["code"] == "NF-V5-01", "VU eingeklemmt")
        check(res["brustschmerz/A"]["stufe"] == "kritisch" and res["brustschmerz/0"]["stufe"] == "dringend", "Brustschmerz: Dringlichkeit passt")
        g = A.evaluate("async () => { const s = window.__lw.sim; const out = []; for (let i = 0; i < 30; i++) { const e = await s.generiere(['stabil','dringend','kritisch'][i % 3]); if (e) out.push(e.wahr.code); } return out; }")
        check(len(g) >= 25 and all(c.startswith("NF-") for c in g), f"Zufallseinsätze mit fremdem Schema ({len(g)})")
        # Antwort auf die (umgedrehte) Frage
        a = A.evaluate("""async () => { const L = window.__lw; const e = await L.sim.probeFall('kollaps', 'A'); const k = L.kontext(e);
          const f = L.store.schema.globale_fragen.phase_4_primaerabfrage.find(x => x.text.includes('bewusstlos')); return [f.id, L.antwortOhneKi(k, f)]; }""")
        print("   ", a)
        check(a[0] == "bw" and any(w in a[1] for w in ("reagiert", "rührt sich nicht", "bewusstlos")), "Anrufer beantwortet „bewusstlos?“ richtig")
        # zurück zum eigenen Schema: alles wie vorher
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        r = A.evaluate("() => { const u = window.__lw.store.uebersetzung; return [u.kompatibel, u.schema === window.__lw.store.schemaRoh]; }")
        check(r == [True, True], "eigenes Schema bleibt unverändert (kompatibel, kein Umbau)")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
