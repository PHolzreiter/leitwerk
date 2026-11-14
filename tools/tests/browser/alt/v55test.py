# v0.55: Akutversorgung – Klick auf belegt zeigt, wer belegt (Einsatz, Fahrzeuge, Buchungsgrund)
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8841", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1600, "height": 1000}).new_page()
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.goto("http://localhost:8841/?debug"); A.wait_for_timeout(2000)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.settings.khGrundAktiv = false; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        r = A.evaluate("""async () => { const L = window.__lw; const s = L.sim;
          s.state.khBelegung = {};
          const e = await s.generiereFall('kollaps', 'A'); e.adresse = { lat: 48.2, lon: 15.62, label: 'Test' };
          const rtw = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'RTW' && !f.einsatzId && f.stationId !== 'btf-flughafen-wien');
          const nef = Object.values(s.state.fahrzeuge).find(f => f.kategorie === 'NEF' && !f.einsatzId && !f.ersatzFuer);
          s.alarmiere(e.id, [rtw.id, nef.id]);
          s.log(e, `${nef.funkrufname}: Notarzt begleitet den Transport`);
          s.bucheKh(e.id, 'kh001', 'bu_polytrauma');
          const b = s.state.khBelegung.kh001 ?? {};
          return { nummer: e.nummer, rtw: rtw.funkrufname, nef: nef.funkrufname, r: Object.keys(b).filter(k => (b[k] ?? []).length) }; }""")
        print("   ", r)
        A.evaluate("() => window.__lw.zeige('akutversorgung')"); A.wait_for_timeout(1500)
        zelle = A.locator(".akv-z[data-kh=kh001] .akv-f[data-r]")
        check(zelle.count() >= 1, f"Belegte Zelle anklickbar ({zelle.count()}, belegt: {r['r']})")
        if zelle.count():
            zelle.first.click(); A.wait_for_timeout(500)
            pop = A.locator(".akv-pop")
            t = pop.inner_text() if pop.count() else ""
            check(r["nummer"] in t and r["rtw"] in t and r["nef"] in t and "Polytrauma" in t, f"Aufschlüsselung: Einsatz, RTW, begleitendes NEF, Buchungsgrund ({t!r})")
            check(A.locator(".dlg-overlay").count() == 0, "Kein Krankenhaus-Dialog dabei")
            A.mouse.click(5, 5); A.wait_for_timeout(300)
            check(A.locator(".akv-pop").count() == 0, "Klick daneben schließt")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
