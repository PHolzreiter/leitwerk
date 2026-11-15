# Beta 59 (Paul 15.11.2026): Abfrage engt ein – Fragen, die den Code nicht mehr ändern, fallen weg (außer Fragen für
# Besatzung/Partner/Eigenschutz); Folgefragen nur, wenn sie passen (Brand: „brennt noch“/„eingeschlossen“ nur bei Feuer,
# „nur Brandalarm?“ gleich nach der Ursache; Sturz: Verletzungsdetails nur, wenn verletzt); keine doppelte Anzahl-Frage.
# Prüft für beide Schemas (eingebaut und das geladene Test-Schema): der Code ist immer derselbe wie mit allen Fragen.
# Aufruf: python3 beta59test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8959", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

LAUF = r"""async (n) => { const L = window.__lw, F = L.schemaFkt, schema = L.store.schema;
  let seed = 59; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const prim = ['alter', 'geschlecht', 'anzahl_patienten', 'bw', 'at'];
  const out = { kap: {}, falsch: [] };
  for (const kap of Object.keys(schema.kapitel)) {
    let alle = 0, eng = 0, faelle = 0;
    for (let i = 0; i < n; i++) {
      const f = F.fallZiehen(schema, kap, rnd); if (!f) continue; faelle++;
      const wahr = f.antworten; const ziel = F.bestimmeCode(schema, kap, wahr)?.code;
      for (const modus of [true, false]) {
        const a = {}; for (const id of prim) if (wahr[id] !== undefined) a[id] = wahr[id];
        const gestellt = new Set(); let z = 0;
        for (let k = 0; k < 40; k++) {
          const q = F.fragenImAblauf(schema, kap, a, { alle: modus }).map((x) => x.frage).find((x) => !gestellt.has(x.id) && a[x.id] === undefined && x.typ !== 'text' && x.typ !== 'kapitelwahl');
          if (!q) break; gestellt.add(q.id); z++;
          if (wahr[q.id] !== undefined && wahr[q.id] !== null) a[q.id] = wahr[q.id];
        }
        const code = F.bestimmeCode(schema, kap, a)?.code;
        if (modus) alle += z; else { eng += z; if (code !== ziel && out.falsch.length < 8) out.falsch.push({ kap, ziel, code, a }); }
      }
    }
    out.kap[kap] = { alle: +(alle / Math.max(1, faelle)).toFixed(1), eng: +(eng / Math.max(1, faelle)).toFixed(1) };
  }
  return out; }"""

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1400, "height": 900})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema:'hell', einfuehrung:true})); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8959/?debug&seed=59"); A.wait_for_timeout(2500)
        for name, laden in [("eingebaut", False), ("Test-Schema", True)]:
            if laden:
                A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1000)
            r = A.evaluate(LAUF, 120)
            ges_a = sum(v["alle"] for v in r["kap"].values()); ges_e = sum(v["eng"] for v in r["kap"].values())
            print(f"     {name}: Fragen je Notruf (Summe über Kapitel) alle {ges_a:.0f} → eingeengt {ges_e:.0f}")
            print("     ", {k: f"{v['alle']}→{v['eng']}" for k, v in r["kap"].items()})
            check(not r["falsch"], f"{name}: eingeengte Abfrage ergibt immer denselben Code {json.dumps(r['falsch'][:2], ensure_ascii=False)[:600]}")
            check(ges_e < ges_a * 0.85, f"{name}: deutlich weniger Fragen ({ges_e:.0f} statt {ges_a:.0f})")

        # ---- Einzelfälle im geladenen Schema
        r = A.evaluate("""() => { const F = window.__lw.schemaFkt, s = window.__lw.store.schema;
            const ids = (kap, a) => F.fragenImAblauf(s, kap, a).filter((x) => x.phase.startsWith('Kapitel')).map((x) => x.frage.id);
            const p = { alter: 40, geschlecht: 'm', anzahl_patienten: '1', bw: 'ja', at: 'normal' };
            return {
              verbrueh: ids('7', { ...p, art: 'verbrennung' }),
              feuer: ids('7', { ...p, art: 'feuer' }),
              alarm: ids('7', { ...p, bw: 'unbekannt', at: 'unbekannt', art: 'feuer', nur_alarm: 'ja' }),
              sturzNein: ids('17', { ...p, hoehe: 'ebenerdig', verletzt: 'nein' }),
              schlag: ids('28', { ...p, sprachstoerung: 'ja' }),
              vu: ids('29', { ...p }),
              vuMehr: ids('29', { ...p, anzahl_patienten: 'unbekannt' }),
              brustD: ids('10', { ...p, sprachschw: 'ja' }),
            }; }""")
        print("    ", json.dumps(r, ensure_ascii=False)[:1500])
        check("brennt_noch" not in r["verbrueh"] and "eingeschlossen" not in r["verbrueh"] and "nur_alarm" not in r["verbrueh"], "Verbrühung: keine Fragen nach Feuer")
        check(r["feuer"][:3] == ["art", "nur_alarm", "brennt_noch"], f"Feuer: Ursache → nur Brandalarm? → brennt noch ({r['feuer'][:3]})")
        check(not any(x in r["alarm"] for x in ["brennt_noch", "gesicht", "flaeche", "sprachschw", "mehrere_verletzte"]) and "eingeschlossen" in r["alarm"], "nur Brandalarm: keine Patientenfragen, „eingeschlossen“ bleibt")
        check(not any(x in r["sturzNein"] for x in ["region", "blutung_stark", "fehlstellung"]), "Sturz ohne Verletzung: keine Verletzungsdetails")
        check(not any(x in r["schlag"] for x in ["schwaeche", "laehmung", "gleichgewicht", "sehen", "kopfschmerz", "vg_schlaganfall", "vg_tia"]) and all(x in r["schlag"] for x in ["fast_gesicht", "fast_arm", "fast_sprache", "seit"]), "Schlaganfall: nach dem ersten Symptom direkt Schlaganfall-Test und Zeitfenster")
        check("anzahl" not in r["vu"] and "anzahl" in r["vuMehr"], "Verkehrsunfall: Anzahl nur, wenn die Primärabfrage sie nicht weiß")
        check(r["brustD"] == ["sprachschw"], f"Brustschmerz mit Sprechdyspnoe: Code steht fest, keine weiteren Fragen ({r['brustD']})")

        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
