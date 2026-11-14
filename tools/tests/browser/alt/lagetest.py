import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8777", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
        A.goto("http://localhost:8777/?debug"); A.wait_for_timeout(1500)
        A.click("[data-act=gen]"); A.wait_for_timeout(300)
        with A.expect_file_chooser() as fc: A.click(".dlg-foot >> text=Datei wählen")
        fc.value.set_files(f"{S}/abf/abfrageschema.json"); A.wait_for_timeout(1200)
        A.click(".tab[data-view=map]")
        # Fall mit Verschlechterung im Gespräch
        A.click("[data-act=gen]"); A.wait_for_timeout(1200)
        A.click(".inc-annehmen"); A.wait_for_timeout(1500)
        A.evaluate("""() => { const s = window.__lw.sim; const e = s.state.einsaetze[0]; const l = e.wahr.lage;
            l.ereignisse = [{um: s.state.zeit + 2000, art: 'verschlechterung', patient: 1, bw: 'nein', at: 'keine', eingetreten: false}];
            e.wahr.abfrage.anrufer.selbst = false; e.wahr.abfrage.anrufer.art = 'privat'; }""")
        A.click("[data-tempo='10']"); A.click("#sim-play"); A.wait_for_timeout(2500); A.click("#sim-play"); A.wait_for_timeout(600)
        v = A.inner_text(".anruf-verlauf")
        check("atmet nicht mehr" in v, "Veränderung im Gespräch: " + v.split("Anrufer:")[-1].strip()[:120])
        # Auflegen -> neue Veränderung -> Folgeanruf
        A.click(".anruf-kopf >> text=Auflegen"); A.wait_for_timeout(700)
        A.evaluate("""() => { const s = window.__lw.sim; const e = s.state.einsaetze[0];
            e.wahr.lage.ereignisse.push({um: s.state.zeit + 2000, art: 'besserung', patient: 1, bw: 'ja', at: 'normal', eingetreten: false}); }""")
        A.click("#sim-play"); A.wait_for_timeout(2000); A.click("#sim-play"); A.wait_for_timeout(700)
        check("Folgeanruf" in A.inner_text(".inc-list"), "Folgeanruf in der Liste")
        check("Folgeanruf klingelt" in A.inner_text(".anruf-kopf"), "Folgeanruf im Kopf")
        A.click(".anruf-kopf >> text=Annehmen"); A.wait_for_timeout(1500)
        v = A.inner_text(".anruf-verlauf")
        last = v.strip().split("\n")[-1]
        check("vorhin schon angerufen" in v and "zu sich gekommen" in v, "Folgeanruf-Text: " + last[:150])
        check(v.count("Notruf 144") == 1, "keine zweite Eröffnung durch die Leitstelle")
        # Eintreffen: Irrtum keine Rea
        msg = A.evaluate("""() => { const s = window.__lw.sim; const e = s.state.einsaetze[0]; const l = e.wahr.lage;
            l.aufgedeckt = false; l.irrtum = 'keineRea'; l.patienten[0].bw='getruebt'; l.patienten[0].at='abnorm';
            const fz = Object.values(s.state.fahrzeuge)[0]; s.eintreffenLage(fz, e); return s.state.funkGespraeche[0].anliegen.text; }""")
        check("Keine Reanimation" in msg, "Funk beim Eintreffen: " + msg)
        A.wait_for_timeout(600)
        A.click(".anruf-kopf >> text=Auflegen"); A.wait_for_timeout(700)
        A.click("text=Auflösung zeigen"); A.wait_for_timeout(400)
        au = A.inner_text(".aufloesung")
        check("Tatsächlich vor Ort" in au and "Verlauf" in au, "Auflösung mit Lage/Verlauf: " + au.replace("\n"," | ")[:400])
        # Plausibilität: 200 Einsätze erzeugen
        res = A.evaluate("""async () => { const s = window.__lw.sim; let bad = 0, n = 0;
            for (let i=0;i<120;i++){ const e = await s.generiere(); if(!e||!e.wahr.abfrage) continue; n++; const a=e.wahr.abfrage.antworten; const nm=(window.__lw.store.schema.codes[e.wahr.abfrage.code]||{}).name||'';
              if ((/Geburt|Schwanger/i.test(nm) || e.wahr.abfrage.kapitel==='24') && (a.geschlecht==='m' || (typeof a.alter==='number' && a.alter>46))) bad++; }
            return [n,bad]; }""")
        check(res[1] == 0, f"Plausibilität: {res[0]} Fälle, {res[1]} unplausibel")
        A.click(".tab[data-view=settings]"); A.wait_for_timeout(500)
        check(A.locator("text=Komplikationen").count() >= 1, "Einstellung Komplikationen")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
