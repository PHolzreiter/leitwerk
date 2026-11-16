# Beta 61 (Paul 16.11.2026, „alle“): Feinschliff der Abfrage je Kapitel – UBG nur bei Anrufer Polizei, Eigenschutz früh,
# Selbstverbrennung nur bei Suizid-Thema, Krisenteam nur ohne akuten Notfall, „tot?“ nur wenn nicht wach, hohe Energie früh,
# graue Haut/Ohnmacht zuerst, Epilepsie nach den Risiken, Ohnmacht vor 6 h, Schlaganfall-Test bei Kopfschmerz nur mit Hinweis,
# „mehrere betroffen“ nur bei mehreren, Vergiftung (Eigenschutz, Hautfarbe, VIZ nur bei Versehen), Schwangerschaft
# (Situation zuerst), Verkehrsunfall (eingeklemmt/Gefahren früh). Beide Schemas.
# Aufruf: python3 beta61test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8961", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

LAUF = r"""() => { const F = window.__lw.schemaFkt, s = window.__lw.store.schema;
  const ids = (kap, a, alle) => F.fragenImAblauf(s, kap, a, { alle: !!alle }).filter((x) => x.phase.startsWith('Kapitel')).map((x) => x.frage.id);
  const p = { anrufer: '1', alter: 60, geschlecht: 'm', anzahl_patienten: '1', bw: 'ja', at: 'normal' };
  return {
    psych: ids('25', { ...p }), psychPol: ids('25', { ...p, anrufer: 'polizei' }),
    psychKein: ids('25', { ...p, lage: 'kein_suizid' }), psychGedanken: ids('25', { ...p, lage: 'gedanken' }), psychGesprungen: ids('25', { ...p, lage: 'gesprungen' }),
    stichWach: ids('27', { ...p, art: 'stich' }), stichNein: ids('27', { ...p, bw: 'nein', at: 'normal', art: 'stich' }, true),
    verl: ids('30', { ...p }), bauch: ids('1', { ...p }), ruecken: ids('5', { ...p, ursache: 'nein' }),
    krampf: ids('12', { ...p, krampft: 'nein' }), sturz: ids('17', { ...p, hoehe: 'boden', verletzt: 'ja' }),
    kopfNein: ids('18', { ...p, ploetzlich_stark: 'nein', sprachstoerung: 'nein', taubheit: 'nein', laehmung: 'nein', verhalten: 'nein' }),
    kopfJa: ids('18', { ...p, ploetzlich_stark: 'nein', sprachstoerung: 'ja' }),
    hitze1: ids('20', { ...p, art: 'hitze' }), hitzeN: ids('20', { ...p, anzahl_patienten: 'n', art: 'hitze' }),
    vergAbs: ids('23', { ...p, absicht: 'absichtlich' }), vergVers: ids('23', { ...p, absicht: 'versehentlich' }),
    schw: ids('24', { ...p, geschlecht: 'w', alter: 30 }), vu: ids('29', { ...p, verletzte: 'ja' }),
  }; }"""

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1400, "height": 900})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema:'hell', einfuehrung:true})); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8961/?debug&seed=61"); A.wait_for_timeout(2500)
        for name, laden in [("eingebaut", False), ("Test-Schema", True)]:
            if laden:
                A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1000)
            r = A.evaluate(LAUF)
            print("    ", name, json.dumps(r, ensure_ascii=False)[:2500])
            pos = lambda l, x: l.index(x) if x in l else 99
            check("ubg" not in r["psych"] and r["psych"][0] == "lage" and "ubg" in r["psychPol"], f"{name}: UBG-Frage nur bei Anrufer Polizei")
            check(pos(r["psych"], "gewalt") < pos(r["psych"], "substanzen") and pos(r["psych"], "waffen") < pos(r["psych"], "substanzen"), f"{name}: Gewalt/Waffen gleich nach der Lage")
            check("selbstverbrennung" not in r["psychKein"] and "selbstverbrennung" in r["psychGedanken"], f"{name}: Selbstverbrennung nur bei Suizid-Thema")
            check("krisenteam" not in r["psychGesprungen"] and "krisenteam" in r["psychKein"], f"{name}: Krisenteam nur ohne akuten Notfall")
            check("tot" not in r["stichWach"] and "tot" in r["stichNein"], f"{name}: „offensichtlich tot?“ nur, wenn nicht wach")
            check(pos(r["verl"], "hohe_energie") == 1, f"{name}: hohe Energie gleich nach der Amputation ({r['verl'][:3]})")
            check(r["bauch"][:2] == ["grau", "ohnmacht"] and r["ruecken"][:3] == ["ursache", "grau", "ohnmacht"], f"{name}: Bauch/Rücken – graue Haut und Ohnmacht zuerst")
            check(pos(r["krampf"], "epilepsie") > pos(r["krampf"], "diabetiker"), f"{name}: Epilepsie nach den Risiken")
            check(pos(r["sturz"], "ohnmacht") < pos(r["sturz"], "aelter6h"), f"{name}: Sturz – Ohnmacht vor 6 Stunden")
            check(not any(x.startswith("fast_") for x in r["kopfNein"]) and any(x.startswith("fast_") for x in r["kopfJa"]), f"{name}: Kopfschmerz – Schlaganfall-Test nur mit Hinweis")
            check("mehrere_symptome" not in r["hitze1"] and "mehrere_symptome" in r["hitzeN"], f"{name}: Hitze – „mehrere betroffen“ nur bei mehreren")
            check(r["vergAbs"][:3] == ["absicht", "aggressiv", "waffen"] and "viz" not in r["vergAbs"] and "viz" in r["vergVers"] and pos(r["vergVers"], "hautfarbe") < pos(r["vergVers"], "viz"), f"{name}: Vergiftung – Eigenschutz früh, Hautfarbe vor VIZ, VIZ nur bei Versehen")
            check(r["schw"][0] == "situation" and "ssw" in r["schw"] and "mehrlinge" in r["schw"], f"{name}: Schwangerschaft – Situation zuerst")
            check(pos(r["vu"], "eingeklemmt") < pos(r["vu"], "mechanismus") and pos(r["vu"], "andere_gefahren") < pos(r["vu"], "mechanismus"), f"{name}: Verkehrsunfall – eingeklemmt/Gefahren vor dem Mechanismus")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
