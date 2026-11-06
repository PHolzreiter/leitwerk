# v0.45: Hubschrauber-Dienstzeiten, NEF-Ausrücken, Rückruf, Funk-Tippen, Anrufer passt zum Ort, Kreißsaal, Kartensuche, Abfrage-Tasten
import subprocess, sys, time, csv
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]; REPO = __import__("os").path.abspath(__import__("os").path.join(__import__("os").path.dirname(__file__), "../../.."))
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
# Daten
fz = list(csv.DictReader(open(f"{REPO}/data/default/fahrzeuge.csv", encoding="utf-8-sig"), delimiter=";"))
heli = [r for r in fz if r.get("kategorie") in ("NAH", "ITH")]
nacht = sorted(r.get("funkrufname", "") for r in heli if (r.get("nachtflug") or "").lower() in ("ja", "true", "1"))
check(len(heli) > 0 and nacht == ["99/002", "99/017"], f"nur C2 und C17 fliegen nachts ({nacht})")
kh = {r["id"]: r for r in csv.DictReader(open(f"{REPO}/data/default/krankenhaeuser.csv", encoding="utf-8-sig"), delimiter=";")}
check("fb_kreisssaal" in kh["kh002"]["einrichtungen"], "UK Krems: Kreißsaal (aus der Geburtshilfe)")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8829", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8829/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        r = A.evaluate("() => window.__lw.sim.settings.ausrueck")
        check(r.get("nefTag") and r["nefTag"][1] > r["tag"][1] if isinstance(r.get("tag"), list) else bool(r.get("nefTag")), f"NEF hat eigene, breitere Ausrückzeiten ({r})")
        # Rückruf nach beendetem Gespräch
        r = A.evaluate("""async () => { const s = window.__lw.sim; const e = await s.generiereFall('kollaps', 'A'); s.anrufAnnehmen(e.id); s.aktualisiere(e.id, { telefon: '0664 1234567' }); s.anrufBeenden(e.id);
            const vor = e.anruf.status; let fehler = null; try { s.anrufAnnehmen(e.id); } catch (x) { fehler = String(x.message || x); }
            return { vor, nach: e.anruf.status, rueckruf: !!e.anruf.rueckruf, fehler, text: e.anruf.gespraech.slice(-2).map(m => m.von + ': ' + m.text).join(' | ') }; }""")
        check(r["vor"] == "beendet" and r["nach"] == "aktiv" and not r["fehler"], f"Rückruf nach beendetem Anruf verbindet wieder ({r})")
        # Funk: wer tippt, wird nicht wegen Stille beendet
        r = A.evaluate("""() => { const s = window.__lw.sim; const fz = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'RTW'); s.call('funkRufen', fz.id);
            const g = s.state.funkGespraeche[0]; g.status = 'offen'; g.echtLetzt = Date.now() - 29000; s.call('funkTippt', g.id); return Date.now() - g.echtLetzt; }""")
        check(r < 2000, f"Funk-Tippen hält das Gespräch offen ({r} ms seit letzter Aktivität)")
        # Anrufer passt zum Ort
        r = A.evaluate("""() => { const f = window.__lw.anruferWaehlen; const a = { alter: 88, geschlecht: 'w', bw: 'ja', at: 'normal' };
            const priv = [], heim = []; for (let i = 0; i < 300; i++) { priv.push(f('krank', a, Math.random, 'Hauptstraße 5, 3500 Krems', undefined, { arten: [] }).rolle);
              heim.push(f('krank', a, Math.random, 'Landespflegeheim Krems', undefined, { arten: ['pflegeheim'], name: 'Landespflegeheim Krems' }).rolle); }
            const arzt = []; for (let i = 0; i < 200; i++) { const x = f('33', { ...a, anforderer: 'normal' }, Math.random, 'Hauptstraße 5, 3500 Krems', undefined, { arten: [] }); arzt.push(x.rolle + ' @ ' + x.ort); }
            return { privHeim: priv.filter(x => /Pflegeheim/.test(x)).length, heimHeim: heim.filter(x => /Pflegeheim/.test(x)).length, arztHeim: arzt.filter(x => /Pflegeheim|Seniorenzentrum|Betreuungszentrum/.test(x)).length, arztHaus: arzt.filter(x => /Hausbesuch|Hauskrankenpflege/.test(x)).length, bsp: arzt.slice(0, 3) }; }""")
        check(r["privHeim"] == 0 and r["arztHeim"] == 0 and r["arztHaus"] > 100, f"kein Pflegeheim-Anrufer aus einem Privathaus ({r})")
        check(r["heimHeim"] > 30, f"im Pflegeheim ruft die Pflege an ({r['heimHeim']}/300)")
        # Kartensuche
        A.evaluate("() => window.__lw.panelZeigen && window.__lw.panelZeigen('karte')"); A.wait_for_timeout(1500)
        if A.locator(".karte-suche input").count():
            A.locator(".karte-suche input").first.fill("Krems"); A.wait_for_timeout(1200)
            t = A.locator(".karte-treffer").first.inner_text()
            check("Krems" in t, f"Kartensuche findet Einrichtungen ({t[:120].replace(chr(10),' | ')})")
        else:
            check(False, "Suchfeld auf der Karte")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
