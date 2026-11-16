# Beta 60 (Paul 16.11.2026): Anrufer nennen die konkrete Stelle bzw. Angabe statt der Kategorien des Schemas
# (Region, Wunde, eingeklemmter Körperteil, Fallhöhe, verbrannte Fläche, Blutungsstärke) – einordnen muss die Leitstelle.
# Aufruf: python3 beta60test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8960", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

LAUF = r"""async () => { const L = window.__lw, s = L.sim, sch = L.store.schema; const out = {};
  let e = null; for (let i = 0; i < 30 && !(e && L.kontext(e)); i++) e = await s.generiere('dringend');
  const k0 = L.kontext(e);
  const frage = (kap, id) => sch.kapitel[kap].fragen.find((f) => f.id === id);
  const fall = (kap, w, text, selbst) => { const k = structuredClone(k0); k.kapitel = kap; k.wahrheit = { ...w };
    if (k.szenario) { k.szenario.hergang = text || ''; k.szenario.geschehen = []; k.szenario.details = []; }
    if (selbst !== undefined) k.anrufer.selbst = selbst; return k; };
  const sag = (kap, id, wert, text, selbst) => { const k = fall(kap, { [id]: wert }, text, selbst); return { ohne: L.antwortOhneKi(k, frage(kap, id)), prompt: L.systemPrompt(k) }; };
  const labels = (kap, id) => frage(kap, id).optionen.map((o) => o.label);
  out.szenario = !!k0.szenario;
  out.ext = sag('17', 'region', 'extremitaet', 'Er ist auf dem Eis ausgerutscht.');
  out.kopfText = sag('17', 'region', 'kopf', 'Sie ist gestürzt und hat eine Platzwunde an der Stirn.');
  out.handgelenk = sag('17', 'region', 'extremitaet', 'Verdacht auf Handgelenksbruch nach Treppensturz.');
  out.mehrere = sag('17', 'region', 'mehrere', 'Platzwunde Stirn, Handgelenk geprellt.');
  out.rumpf = sag('17', 'region', 'rumpf', '');
  out.wunde = sag('27', 'wunde', 'zentral', '');
  out.klemm = sag('22', 'koerperteil', 'mittel', '');
  out.hoehe = sag('17', 'hoehe', 'gross', '');
  out.hoeheText = sag('17', 'hoehe', 'gross', 'Er ist beim Obstpflücken von der Leiter gefallen.');
  out.flaeche = sag('7', 'flaeche', 'mittel', '');
  out.staerke = sag('21', 'staerke', 'stark', '');
  out.selbst = sag('17', 'region', 'extremitaet', 'Ich bin umgeknickt, der Knöchel ist ganz dick.', true);
  // gleiche Antwort bei wiederholter Frage
  out.gleich = sag('17', 'region', 'extremitaet', '').ohne === sag('17', 'region', 'extremitaet', '').ohne;
  out.labels = { region: labels('17', 'region'), wunde: labels('27', 'wunde'), klemm: labels('22', 'koerperteil'), hoehe: labels('17', 'hoehe'), flaeche: labels('7', 'flaeche'), staerke: labels('21', 'staerke') };
  return out; }"""

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1400, "height": 900})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema:'hell', einfuehrung:true})); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8960/?debug&seed=60"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; window.__lw.store.setSettings(st); }")
        for name, laden in [("eingebaut", False), ("Test-Schema", True)]:
            if laden:
                A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1000)
            r = A.evaluate(LAUF)
            print(f"     {name}:", {k: (v["ohne"] if isinstance(v, dict) and "ohne" in v else v) for k, v in r.items() if k != "labels"})
            def keinLabel(x, key):
                return not any(l in x["ohne"] or l in x["prompt"] for l in r["labels"][key] if len(l) > 12)
            check(keinLabel(r["ext"], "region") and r["ext"]["ohne"].startswith(("Am ", "An ", "Im ")), f"{name}: Region als konkrete Stelle ({r['ext']['ohne']})")
            check(r["kopfText"]["ohne"] == "An der Stirn.", f"{name}: Stelle aus der Fallgeschichte ({r['kopfText']['ohne']})")
            check(r["handgelenk"]["ohne"] == "Am Handgelenk.", f"{name}: Handgelenk aus der Geschichte ({r['handgelenk']['ohne']})")
            check(" und " in r["mehrere"]["ohne"] and "Stirn" in r["mehrere"]["ohne"] and "Handgelenk" in r["mehrere"]["ohne"], f"{name}: mehrere Stellen ({r['mehrere']['ohne']})")
            check(keinLabel(r["rumpf"], "region"), f"{name}: Rumpf konkret ({r['rumpf']['ohne']})")
            check(keinLabel(r["wunde"], "wunde") and r["wunde"]["ohne"].startswith(("Am ", "An ", "Im ")), f"{name}: Wunde konkret ({r['wunde']['ohne']})")
            check(keinLabel(r["klemm"], "klemm") and len(r["klemm"]["ohne"]) < 25, f"{name}: eingeklemmter Körperteil konkret ({r['klemm']['ohne']})")
            check(keinLabel(r["hoehe"], "hoehe") and any(w in r["hoehe"]["ohne"] for w in ["Balkon", "Leiter", "Gerüst", "Heuboden"]), f"{name}: Fallhöhe konkret ({r['hoehe']['ohne']})")
            check("Fallakte" in r["hoeheText"]["prompt"] and "Meter" in r["hoeheText"]["ohne"], f"{name}: Fallhöhe passend zur Geschichte ({r['hoeheText']['ohne']})")
            check(keinLabel(r["flaeche"], "flaeche") and "%" not in r["flaeche"]["ohne"], f"{name}: verbrannte Fläche konkret ({r['flaeche']['ohne']})")
            check(keinLabel(r["staerke"], "staerke"), f"{name}: Blutung konkret ({r['staerke']['ohne']})")
            check(r["selbst"]["ohne"] == "Am Knöchel." and "du bist am Knöchel" in r["selbst"]["prompt"], f"{name}: Patient ruft selbst an ({r['selbst']['ohne']})")
            check(r["gleich"], f"{name}: bei der Wiederholung dieselbe Stelle")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
