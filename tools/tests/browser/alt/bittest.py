import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8786", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); logs=[]; fails=0
def check(ok, what):
    global fails
    print(("OK    " if ok else "FEHLER"), what)
    if not ok: fails += 1
J="window.__lw.sim"
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1500, "height": 950}).new_page()
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.goto("http://localhost:8786/?debug"); A.wait_for_timeout(1500)
        print("   KH:", A.evaluate("() => window.__lw.store.list('hospitals').length"))
        A.click("[data-act=gen]"); A.wait_for_timeout(300)
        with A.expect_file_chooser() as fc: A.click(".dlg-foot >> text=Datei wählen")
        fc.value.set_files(f"{S}/abf/abfrageschema.json"); A.wait_for_timeout(1200)
        A.click(".tab[data-view=map]")
        A.click("[data-act=gen]"); A.wait_for_timeout(1200)
        A.click(".inc-annehmen"); A.wait_for_timeout(1000)
        A.click(".anruf-kopf >> text=Auflegen"); A.wait_for_timeout(400)
        A.fill(".mask .addr input >> nth=1", "Krems"); A.wait_for_timeout(800)
        A.click(".mask .addr-list:not([hidden]) .addr-item >> nth=0"); A.wait_for_timeout(1500)
        ids = A.evaluate(f"""() => {{ const s={J}; const e=s.state.einsaetze[0];
            if (!e.wahr.lage) e.wahr.lage = {{patienten:[{{nr:1,geschlecht:'m',alter:55,bw:'ja',at:'normal',sichtung:'gelb'}}],gemeldet:1,irrtum:null,ereignisse:[],aufgedeckt:false,verlauf:[]}};
            e.wahr.lage.bit = true; e.wahr.transport = true; e.wahr.rtwBuchtSelbst = true;
            e.wahr.lat = e.adresse.lat; e.wahr.lon = e.adresse.lon;
            const fz=Object.values(s.state.fahrzeuge); const rtw=fz.find(f=>f.rmTyp==='RTW-C'&&f.phase==='frei');
            const bit=fz.find(f=>f.rmTyp==='BIT'); return [e.id, rtw.id, bit && bit.id, bit && bit.funkrufname]; }}""")
        print("   ", ids)
        A.evaluate(f"([e,r]) => {J}.call('alarmiere', e, [r])", ids[:2])
        A.evaluate(f"() => {{ {J}.call('setTempo', 30); {J}.call('start'); }}")
        nf = None
        for i in range(80):
            A.wait_for_timeout(1000)
            nf = A.evaluate(f"(e) => ({J}.einsatz(e).nachforderungen||[]).map(n=>n.art+':'+n.erledigt)", ids[0])
            if any(x.startswith("BIT") for x in nf): break
        A.evaluate(f"() => {J}.call('pause')")
        check(any(x.startswith("BIT") for x in nf), f"Besatzung fordert BIT nach: {nf}")
        funk = A.evaluate(f"(id) => ({J}.state.funkGespraeche||[]).filter(g=>g.fzId===id).map(g=>g.anliegen && g.anliegen.text).join(' | ')", ids[1])
        print("   Funk:", funk[:220])
        check("BIT" in funk, "Funk: benötigen BIT")
        emp = A.evaluate(f"async (e) => {{ const v=await {J}.vorschlaege(e); return {J}.empfehlung(e, v); }}", ids[0])
        print("   Empfehlung:", emp["gruende"])
        check(any("BIT" in g for g in emp["gruende"]), "Vorschlag enthält BIT")
        if ids[2]:
            A.evaluate(f"([e,r,b]) => {J}.call('alarmiere', e, [b])", ids)
            A.evaluate(f"() => {{ {J}.call('setTempo', 30); {J}.call('start'); }}")
            res=None
            for i in range(200):
                A.wait_for_timeout(1000)
                res = A.evaluate(f"([e,r,b]) => {{ const s={J}; return [s.state.fahrzeuge[r].einsatzId===e, s.state.fahrzeuge[r].phase, s.state.fahrzeuge[b].phase]; }}", ids)
                if res[2] in ("transport","uebergabe"): break
            A.evaluate(f"() => {J}.call('pause')")
            print("   RTW/BIT:", res)
            check(not res[0] and res[2] in ("transport","uebergabe"), "BIT transportiert, RTW wird frei")
        # Überstellung mit BIT
        A.evaluate(f"([e,r,b]) => {{ const s={J}; const x=s.state.fahrzeuge[b]; if (x.einsatzId) s.freigeben(x); }}", ids)
        kid = A.evaluate(f"""async () => {{ const s={J}; for (let i=0;i<30;i++) {{ const k=await s.generiereSek('online'); if (k) {{ k.d.sek.bit = true; return k.id; }} }} return null; }}""")
        vs = A.evaluate(f"async (id) => (await {J}.ktVorschlaege(id)).slice(0,3).map(v=>[v.fz.rmTyp, v.ersatz, v.begleit && v.begleit.rmTyp])", kid)
        print("   SEK mit BIT:", vs)
        check(len(vs)>0 and vs[0][0]=="BIT", "Überstellung mit BIT: BIT zuerst vorgeschlagen")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
