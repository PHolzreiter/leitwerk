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
        A.add_init_script("(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.goto("http://localhost:8776/?debug"); A.wait_for_timeout(1500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")
        A.click(".lw-panel[data-panel=einsatzliste] >> text=+ Test"); A.click(".ctx-menu.test >> text=Notfall"); A.wait_for_timeout(1200)
        A.click(".tel-row:is(.st-klingelt, .st-verpasst) .btn.primary"); A.wait_for_timeout(1200)
        A.click(".lw-panel[data-panel=abfrage] >> text=Beenden"); A.wait_for_timeout(500)
        # Adresse setzen und RTW + NEF alarmieren
        A.fill(".lw-panel[data-panel=einsatz] .mask .addr input >> nth=1", "Krems"); A.wait_for_timeout(800)
        A.click(".lw-panel[data-panel=einsatz] .mask .addr-list:not([hidden]) .addr-item >> nth=0"); A.wait_for_timeout(2500)
        ids = A.evaluate("""() => { const s=window.__lw.sim; const e=s.state.einsaetze[0];
            const fz=Object.values(s.state.fahrzeuge); const rtw=fz.find(f=>f.kategorie==='RTW'&&f.phase==='frei'&&!f.funkrufname.startsWith('77/8')); const nef=fz.find(f=>f.kategorie==='NEF'&&f.phase==='frei'&&!f.funkrufname.startsWith('77/8'));
            return [e.id, rtw&&rtw.id, nef&&nef.id]; }""")
        print("   ", ids)
        A.evaluate("([e,r,n]) => window.__lw.sim.call('alarmiere', e, [r,n].filter(Boolean))", ids)
        A.wait_for_timeout(800)
        def frei():
            A.evaluate("async () => { const s = window.__lw.sim; for (let i = 0; i < 100 && s.funkKanalSpricht(null); i++) await new Promise(r => setTimeout(r, 150)); }")
        def sag(t):
            frei(); A.fill(".funk-fenster .funk-eine input", t); A.press(".funk-fenster .funk-eine input", "Enter"); A.wait_for_timeout(1500); frei()
        # LEO ruft RTW: Lagemeldung anfordern
        A.evaluate("() => window.__lw.zeige('funk')"); A.wait_for_timeout(300); A.evaluate("() => { const b = document.querySelector('.funk-fenster .funk-modus [data-m=text]'); if (b) b.click(); }")
        A.evaluate("([e,r]) => window.__lw.sim.call('funkRufen', r)", ids)
        A.wait_for_timeout(6000); frei()
        v = A.inner_text(".funk-chat")
        check("von LEO, kommen" in v and ("kommen" in v.split("von LEO, kommen")[-1] or "hört" in v), "LEO ruft, Fahrzeug meldet sich: " + v.replace("\n"," | ")[:200])
        sag("Hier LEO, bitte gebt mir eine Lagemeldung, wenn ihr vor Ort seid, kommen")
        v = A.inner_text(".funk-chat")
        check("Lagemeldung kommt" in v, "Lagemeldung zugesagt")
        sag("Hier LEO, wie ist euer Status, wann seid ihr vor Ort, kommen")
        check("Anfahrt" in A.inner_text(".funk-chat") or "vor Ort" in A.inner_text(".funk-chat"), "Status-Antwort")
        sag("Hier LEO, verstanden, Ende")
        check("Ende" in A.inner_text(".funk-chat"), "Gespräch beendet, im Verlauf sichtbar")
        # Eintreffen erzwingen: Lage mit 3 Betroffenen, NA nötig
        res = A.evaluate("""([eid,r]) => { const s=window.__lw.sim; const e=s.einsatz(eid); const l=e.wahr.lage;
            l.aufgedeckt=false; l.patienten=[{nr:1,geschlecht:'m',alter:50,bw:'nein',at:'abnorm',sichtung:'rot'},{nr:2,geschlecht:'w',alter:30,bw:'ja',at:'normal',sichtung:'gelb'},{nr:3,geschlecht:'w',alter:20,bw:'ja',at:'normal',sichtung:'gruen'}];
            s.state.laeuft = true; const fz=s.state.fahrzeuge[r]; fz.phase='vorOrt'; s.eintreffenLage(fz,e); if (e.lageGeplant) { e.lageGeplant.um = s.state.zeit; s.lageTick(s.state.zeit); } s.notify(); return [JSON.stringify(e.nachforderungen), (s.state.funkGespraeche[0]||{}).status]; }""", ids)
        print("   ", res)
        A.wait_for_timeout(1500)
        check("LEO von" in A.inner_text(".funk-chat").split("verstanden, Ende")[-1], "RTW ruft LEO")
        sag("Hier LEO, kommen"); A.wait_for_timeout(1500)
        v = A.inner_text(".funk-chat")
        print("   AKTIV:", v.replace("\n"," | ")[:500])
        check("Betroffene" in v, "Lagemeldung mit Betroffenen")
        A.screenshot(path=f"{S}/shots5/funk_lage.png")
        sag("Verstanden, Ende")
        A.evaluate("() => window.__lw.zeige('einsatz')"); A.wait_for_timeout(500)
        m = A.inner_text(".lw-panel[data-panel=einsatz] .mask")
        check("Nachforderung" in m or "nachgefordert" in m.lower() or "fordert" in m, "Nachforderung in der Maske sichtbar")
        A.screenshot(path=f"{S}/shots5/funk_maske.png")
        A.evaluate("() => window.__lw.zeige('funk')"); A.wait_for_timeout(400)
        A.screenshot(path=f"{S}/shots5/funk_reiter.png")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
