# Überstellung an einen echten Piloten (Alarm, Status 9-2-3-4-5-6) und SEK mit mehreren Fahrzeugen (KTW/RTW/SRTW + NEF)
# Aufruf: python3 sekpilottest.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8931", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
J = "window.__lw.sim"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); logs = []
        A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8931/?debug"); A.wait_for_timeout(2000)
        A.evaluate(f"() => {{ const s={J}; const d=new Date(s.state.zeit); d.setHours(10,0,0,0); s.state.zeit=d.getTime(); s.settings.rate=0; s.settings.ktAktiv=false; }}")
        A.evaluate(f"() => {J}.call('start')"); A.wait_for_timeout(800); A.evaluate(f"() => {J}.call('pause')")

        # ---- 1) NEF-Begleitung zu KTW, RTW und SRTW
        kid = A.evaluate(f"async () => {{ const s={J}; const k=await s.generiereSek('online'); await s.call('ktSetze', k.id, {{ sek: {{ ...k.d.sek, arzt: true, monitoring: false }}, sofort: true }}); return k.id; }}")
        print("    Code:", A.evaluate(f"(id) => {J}.ktAuftrag(id).d.code", kid))
        vs = A.evaluate(f"async (id) => (await {J}.ktVorschlaege(id)).map(v=>[v.fz.rmTyp, v.begleit && v.begleit.rmTyp, !!v.nurBegleit])", kid)
        print("   ", vs[:12])
        check(any(v[0] == "KTW" and v[1] == "NEF" for v in vs), "SEK mit Notarzt: KTW + NEF wird vorgeschlagen")
        check(any(v[2] and v[0] == "NEF" for v in vs), "freie NEF als eigene Begleit-Zeilen")
        r = A.evaluate(f"""async (id) => {{ const s={J}; const v=(await s.ktVorschlaege(id)); const nef=v.find(x=>x.nurBegleit);
            try {{ await s.call('ktVormerken', id, nef.fz.id, 'neu', null); return 'kein Fehler'; }} catch (e) {{ return String(e.message||e); }} }}""", kid)
        check("Begleitung" in r, f"NEF allein als Transport abgelehnt ({r})")
        r = A.evaluate(f"""async (id) => {{ const s={J}; const v=(await s.ktVorschlaege(id)); const nef=v.find(x=>x.nurBegleit);
            const ktw=Object.values(s.state.fahrzeuge).find(f=>f.rmTyp==='KTW' && s.verfuegbar(f) && !f.kt && !f.einsatzId);
            await s.call('ktVormerken', id, ktw.id, 'neu', nef.fz.id); await s.call('ktSchicken', ktw.id);
            const k=s.ktAuftrag(id); return [k.status, k.fz===ktw.id, k.begleit===nef.fz.id, !!s.state.fahrzeuge[nef.fz.id].kt?.aktiv]; }}""", kid)
        check(r == ["unterwegs", True, True, True], f"KTW + NEF zusammen alarmiert {r}")
        for typ in ["SRTW", "RTW"]:
            r = A.evaluate(f"""async (typ) => {{ const s={J}; const k=await s.generiereSek('online'); await s.call('ktSetze', k.id, {{ sek: {{ ...k.d.sek, arzt: true, monitoring: false }}, sofort: true }});
                const v=await s.ktVorschlaege(k.id); const nef=v.find(x=>x.nurBegleit); const t=Object.values(s.state.fahrzeuge).find(f=>(f.rmTyp===typ || (typ==='RTW' && f.rmTyp==='RTW-C')) && s.verfuegbar(f) && !f.kt && !f.einsatzId);
                if (!nef || !t) return 'nichts frei';
                await s.call('ktVormerken', k.id, t.id, 'neu', nef.fz.id); await s.call('ktSchicken', t.id); const k2=s.ktAuftrag(k.id); return [k2.status, k2.begleit===nef.fz.id]; }}""", typ)
            check(r == ["unterwegs", True], f"{typ} + NEF zusammen alarmiert {r}")

        # ---- 2) Überstellung an den Spieler-Hubschrauber
        x = A.evaluate(f"""async () => {{ const s={J}; const k=await s.generiereSek('online'); await s.call('ktSetze', k.id, {{ sofort: true }});
            const v=await s.ktVorschlaege(k.id, true); const h=v.find(x=>['ITH','NAH'].includes(x.fz.rmTyp) && s.verfuegbar(x.fz));
            if (!h) return {{ fehler: new Date(s.state.zeit).toString().slice(16,21) + ' ' + Object.values(s.state.fahrzeuge).filter(f=>['ITH','NAH'].includes(f.rmTyp)).map(f=>f.funkrufname+':'+(s.flugHindernis(f)||'ok')+':'+f.status).join(' ') + ' | ' + v.length }}; s.pilotUebernehmen(h.fz.id); return {{ k: k.id, h: h.fz.id, name: h.fz.funkrufname }}; }}""")
        check(x is not None and "fehler" not in x, f"Hubschrauber für die Überstellung: {x}")
        st = lambda: A.evaluate(f"(x) => {{ const s={J}; const f=s.state.fahrzeuge[x.h]; const k=s.ktAuftrag(x.k); return [f.status, k.status, !!f.kt, !!f.pilot, s.pilotKt(f) && s.pilotKt(f).art]; }}", x)
        r = A.evaluate(f"async (x) => {{ const s={J}; await s.call('ktVormerken', x.k, x.h, 'neu', null); await s.call('ktSchicken', x.h); return 1; }}", x)
        r = st(); print("   nach Alarm:", r)
        check(r[0] in ("alarmWache", "alarmFunk") and r[3] and r[4] == "ab", "Pilot wird alarmiert (Melder), Ziel Abholort")
        A.evaluate(f"() => {{ {J}.call('setTempo', 1); {J}.call('start'); }}"); A.wait_for_timeout(1500)
        check(st()[0] in ("alarmWache", "alarmFunk"), "Computer fliegt den Spieler-Hubschrauber nicht selbst los")
        bo = A.evaluate(f"(x) => {{ const s={J}; const z=s.pilotBo(s.state.fahrzeuge[x.h]); return z && z.label; }}", x)
        check(bool(bo) and "Abholort" in bo, f"Navigation: {bo}")
        A.evaluate("""async (h) => { const L = window.__lw; await L.pilotUi.oeffnen(); const f = L.sim.state.fahrzeuge[h]; const ich = L.sim.ich || L.mp.ich; f.pilot.pid = ich.pid; L.sim.notify?.(); }""", x["h"]); A.wait_for_timeout(1500)
        A.set_viewport_size({"width": 1500, "height": 950}); A.wait_for_timeout(800)
        if len(sys.argv) > 3: A.screenshot(path=f"{sys.argv[3]}/sekpilot_alarm.png")
        tx = A.inner_text("body")
        check("Überstellung" in tx, "Piloten-Interface zeigt die Überstellung")
        schritte = [("zumZO", "erst"), ("alarmiert", None), ("zumBO", None), ("zumZO", "erst"), ("amBO", None), ("amZO", "Status 4"), ("zumZO", None), ("freiWache", "abschließen"), ("amZO", None), ("freiFunk", None)]
        for s_, fehler in schritte:
            r = A.evaluate(f"([x, s_]) => {J}.pilotStatus(x.h, s_)", [x, s_])
            ok = (r is None) if fehler is None else (r is not None)
            check(ok, f"Pilot drückt {s_}: {r or 'ok'} → {st()}")
        r = st()
        check(r[1] == "erledigt" and not r[2] and r[0] == "freiFunk", f"Überstellung erledigt, Pilot frei über Funk {r}")
        prot = A.evaluate(f"(x) => {J}.ktAuftrag(x.k).protokoll.map(p=>p.text)", x)
        print("   Protokoll:", " | ".join(prot[-7:]))
        check(any("Patient an Bord" in t for t in prot) and any("übergeben" in t for t in prot), "Protokoll: an Bord und übergeben")
        print("\n".join(logs[:5])); check(not logs, "keine Fehler auf der Seite")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); sys.exit(1 if fails else 0)
