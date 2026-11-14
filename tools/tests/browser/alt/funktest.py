import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8776", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.goto("http://localhost:8776/?debug"); A.wait_for_timeout(1500)
        A.click("[data-act=gen]"); A.wait_for_timeout(300)
        with A.expect_file_chooser() as fc: A.click(".dlg-foot >> text=Datei wählen")
        fc.value.set_files(f"{S}/abf/abfrageschema.json"); A.wait_for_timeout(1200)
        A.click(".tab[data-view=map]")
        A.click("[data-act=gen]"); A.wait_for_timeout(1200)
        A.click(".inc-annehmen"); A.wait_for_timeout(1200)
        A.click(".anruf-kopf >> text=Auflegen"); A.wait_for_timeout(500)
        # Adresse setzen und RTW + NEF alarmieren
        A.fill(".mask .addr input >> nth=1", "Krems"); A.wait_for_timeout(800)
        A.click(".mask .addr-list:not([hidden]) .addr-item >> nth=0"); A.wait_for_timeout(2500)
        ids = A.evaluate("""() => { const s=window.__lw.sim; const e=s.state.einsaetze[0];
            const fz=Object.values(s.state.fahrzeuge); const rtw=fz.find(f=>f.kategorie==='RTW'&&f.phase==='frei'); const nef=fz.find(f=>f.kategorie==='NEF'&&f.phase==='frei');
            return [e.id, rtw&&rtw.id, nef&&nef.id]; }""")
        print("   ", ids)
        A.evaluate("([e,r,n]) => window.__lw.sim.call('alarmiere', e, [r,n].filter(Boolean))", ids)
        A.wait_for_timeout(800)
        # LEO ruft RTW: Lagemeldung anfordern
        A.click(".rtab[data-tab=funk]")
        A.evaluate("([e,r]) => window.__lw.sim.call('funkRufen', r)", ids)
        A.click("[data-tempo='10']"); A.click("#sim-play"); A.wait_for_timeout(1500); A.click("#sim-play"); A.wait_for_timeout(600)
        v = A.inner_text(".funk-aktiv")
        check("von LEO kommen" in v and "kommen" in v.split("von LEO kommen")[-1], "LEO ruft, Fahrzeug meldet sich: " + v.replace("\n"," | ")[:200])
        A.click(".funk-schnell >> text=Lagemeldung anfordern"); A.wait_for_timeout(700)
        v = A.inner_text(".funk-aktiv")
        check("Lagemeldung" in v and "so verstanden" in v, "Lagemeldung zugesagt")
        A.click(".funk-schnell >> text=Status / Eintreffen?"); A.wait_for_timeout(700)
        check("Anfahrt" in A.inner_text(".funk-aktiv") or "vor Ort" in A.inner_text(".funk-aktiv"), "Status-Antwort")
        A.click(".funk-schnell >> text=Verstanden, ENDE"); A.wait_for_timeout(600)
        check("ENDE" in A.inner_text(".funk-alle"), "Gespräch beendet, im Verlauf sichtbar")
        # Eintreffen erzwingen: Lage mit 3 Betroffenen, NA nötig
        res = A.evaluate("""([eid,r]) => { const s=window.__lw.sim; const e=s.einsatz(eid); const l=e.wahr.lage;
            l.aufgedeckt=false; l.patienten=[{nr:1,geschlecht:'m',alter:50,bw:'nein',at:'abnorm',sichtung:'rot'},{nr:2,geschlecht:'w',alter:30,bw:'ja',at:'normal',sichtung:'gelb'},{nr:3,geschlecht:'w',alter:20,bw:'ja',at:'normal',sichtung:'gruen'}];
            const fz=s.state.fahrzeuge[r]; fz.phase='vorOrt'; s.eintreffenLage(fz,e); s.notify(); return [JSON.stringify(e.nachforderungen), (s.state.funkGespraeche[0]||{}).status]; }""", ids)
        print("   ", res)
        A.wait_for_timeout(700)
        check("ruft LEO" in A.inner_text(".funk-rufe"), "RTW ruft LEO")
        A.click(".funk-rufe >> text=Antworten"); A.wait_for_timeout(700)
        v = A.inner_text(".funk-aktiv")
        print("   AKTIV:", v.replace("\n"," | ")[:500])
        check("Betroffene" in v, "Lagemeldung mit Betroffenen")
        A.screenshot(path=f"{S}/shots5/funk_lage.png")
        if A.locator(".funk-schnell >> text=Verstanden, ENDE").is_enabled(): A.click(".funk-schnell >> text=Verstanden, ENDE"); A.wait_for_timeout(500)
        else: print("   ENDE-Knopf deaktiviert")
        A.click(".rtab[data-tab=einsatz]"); A.wait_for_timeout(500)
        m = A.inner_text(".mask")
        check("Nachforderung" in m or "nachgefordert" in m.lower() or "fordert" in m, "Nachforderung in der Maske sichtbar")
        A.screenshot(path=f"{S}/shots5/funk_maske.png")
        A.click(".rtab[data-tab=funk]"); A.wait_for_timeout(400)
        A.screenshot(path=f"{S}/shots5/funk_reiter.png")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
