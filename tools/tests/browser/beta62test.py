# Beta 62 (Paul 16.11.2026: „alles überarbeiten“): Ersticken (Atemweg zuerst), Allergie (erst „überhaupt Beschwerden?“),
# Blutzucker (gewalttätig nur bei auffälligem Verhalten), Gefahrstoff (Beschwerden zuerst), Brustschmerz (Kokain nicht ab 65),
# Bewusstlos (Bauchschmerz nur 12–50), Kranke Person (Hauptbeschwerde zuerst), Texte vorlesbar. Beide Schemas.
# Aufruf: python3 beta62test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json, re
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8962", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

LAUF = r"""() => { const F = window.__lw.schemaFkt, s = window.__lw.store.schema;
  const ids = (kap, a, alle) => F.fragenImAblauf(s, kap, a, { alle: !!alle }).filter((x) => x.phase.startsWith('Kapitel')).map((x) => x.frage.id);
  const p = { anrufer: '1', alter: 40, geschlecht: 'm', anzahl_patienten: '1', bw: 'ja', at: 'normal' };
  const texte = []; for (const K of Object.values(s.kapitel)) for (const f of K.fragen) texte.push(f.text);
  return {
    erst: ids('11', { ...p }), allNein: ids('2', { ...p, ursache: 'andere', symptome: 'nein' }), allJa: ids('2', { ...p, ursache: 'andere', symptome: 'ja', atem_schluck: 'nein' }),
    allAtem: ids('2', { ...p, ursache: 'andere', symptome: 'ja', atem_schluck: 'ja' }, true),
    bzNorm: ids('13', { ...p, diabetiker: 'ja', verhalten: 'nein' }), bzAuff: ids('13', { ...p, diabetiker: 'ja', verhalten: 'ja' }),
    gas: ids('8', { ...p }), brustAlt: ids('10', { ...p, alter: 80 }), brustJung: ids('10', { ...p, alter: 30 }),
    bwAlt: ids('31', { ...p, geschlecht: 'w', alter: 70 }), bwJung: ids('31', { ...p, geschlecht: 'w', alter: 30 }),
    krank: ids('26', { ...p }), texte,
  }; }"""

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1400, "height": 900})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema:'hell', einfuehrung:true})); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8962/?debug&seed=62"); A.wait_for_timeout(2500)
        for name, laden in [("eingebaut", False), ("Test-Schema", True)]:
            if laden:
                A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1000)
            r = A.evaluate(LAUF)
            print("    ", name, json.dumps({k: v for k, v in r.items() if k != "texte"}, ensure_ascii=False)[:1500])
            check(r["erst"][:1] == ["atemweg"], f"{name}: Ersticken – „sprechen, husten, atmen?“ zuerst")
            check(not any(x in r["allNein"] for x in ["atem_schluck", "sprachschw"]) and "sprachschw" not in r["allJa"] and "sprachschw" in r["allAtem"], f"{name}: Allergie – ohne Beschwerden keine Atemfragen, Sprechdyspnoe nur bei Atem-/Schluckbeschwerden")
            check(r["allNein"][:2] == ["ursache", "symptome"] or r["allNein"][:1] == ["ursache"], f"{name}: Allergie – „überhaupt Beschwerden?“ früh ({r['allNein'][:3]})")
            check("gewalttaetig" not in r["bzNorm"] and "gewalttaetig" in r["bzAuff"], f"{name}: Blutzucker – gewalttätig nur bei auffälligem Verhalten")
            check(r["gas"][:2] == ["betroffene", "substanz"], f"{name}: Gefahrstoff – Beschwerden zuerst, Stoff danach ({r['gas'][:2]})")
            check("kokain" not in r["brustAlt"], f"{name}: Brustschmerz – keine Kokain-Frage bei 80 Jahren")
            check("bauchschmerz" not in r["bwAlt"], f"{name}: Bewusstlos – Bauchschmerz nicht bei 70-Jähriger")
            check(r["krank"][:1] == ["hauptbeschwerde"], f"{name}: Kranke Person – Hauptbeschwerde zuerst")
            schlecht = [t for t in r["texte"] if re.search(r"der Anrufer|ist der Anrufer", t, re.I) or " / " in t.split("(")[0]]
            check(not [t for t in schlecht if "System" not in t], f"{name}: Texte vorlesbar ({schlecht[:4]})")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
