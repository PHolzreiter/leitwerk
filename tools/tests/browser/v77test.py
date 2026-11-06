# v0.77: Übergabe NAH/RTW, Vorlesen (Funkrufnamen, PLZ, Telefon), Multiplayer-Check Version/Kartenpakete
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8878", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
J = "window.__lw.sim"
SZENARIO = """async (ort) => { const s = window.__lw.sim; const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  s.settings.wetterAktiv = false;
  const st = window.__lw.store.settings.stufen.find(x => x.kategorie === 'kritisch').stufe;
  const e = s.erstelleEinsatz({ lat: ort[0], lon: ort[1], adresse: 'Test', code: { code: 'TEST', name: 'Test', stufe: st } });
  e.adresse = { lat: ort[0], lon: ort[1], label: 'Test' }; e.wahr.transport = true; e.wahr.lat = ort[0]; e.wahr.lon = ort[1]; if (e.wahr.lage?.fall) e.wahr.lage.fall.naMit = true; const kc = window.__lw.store.list('codes').find(c => s.stufeVon({ ...e, code: c.code })?.kategorie === 'kritisch'); e.code = kc.code; e.wahr.code = kc.code;
  const fz = Object.values(s.state.fahrzeuge);
  const d = (f) => Math.hypot(f.lat - ort[0], (f.lon - ort[1]) * 0.66);
  const rtw = fz.filter(f => f.kategorie === 'RTW' && s.verfuegbar(f) && !f.funkrufname.startsWith('77/8')).sort((a, b) => d(a) - d(b))[0];
  const nah = fz.filter(f => f.rmTyp === 'NAH' && s.verfuegbar(f) && !s.flugHindernis(f)).sort((a, b) => d(a) - d(b))[0];
  s.alarmiere(e.id, [rtw.id, nah.id]);
  const spur = [];
  for (let i = 0; i < 60; i++) {
    const offen = [rtw, nah].filter(f => f.einsatzId === e.id && f.phaseEnde !== null && f.phase !== 'transport' && f.phase !== 'warteKH');
    if (!offen.length) break;
    while ([rtw, nah].some(f => f.phase === 'routing')) await sleep(20);
    const f = offen.sort((a, b) => a.phaseEnde - b.phaseEnde)[0];
    s.state.zeit = Math.max(s.state.zeit, f.phaseEnde); s.updateVehicle(f, s.state.zeit);
    while ([rtw, nah].some(f => f.phase === 'routing')) await sleep(20);
    spur.push(f.funkrufname + ':' + f.phase);
  }
  const zustand = (f) => ({ einsatz: f.einsatzId === e.id, phase: f.phase, status: f.status });
  return { kh: !!e.kh || !!e.khAnfrage, rtw: zustand(rtw), nah: zustand(nah), log: e.protokoll.map(p => p.text).filter(t => /Transport|übergeben|Hubschrauber|RTW/.test(t)).slice(-4) }; }"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8878/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        # --- Vorlesen
        t = A.evaluate("() => ['Hier 69/902, kommen', 'Hauptstraße 5, 3481 Fels am Wagram', 'Rückruf 0664 1234567', 'in 3500 Krems', 'um 1500 Uhr'].map(window.__lw.sprechText)")
        print("   ", t)
        check(t[0] == "Hier 69, 902, kommen", "Funkrufname mit Pause")
        check("34, 81 Fels" in t[1] and "35 hundert Krems" in t[3] and "1500 Uhr" in t[4], "Postleitzahl geteilt, Uhrzeit nicht")
        check("0 6 6 4 1 2 3 4 5 6 7" in t[2], "Telefonnummer Ziffer für Ziffer")
        # --- Multiplayer: Version und Kartenpakete
        r = A.evaluate("""() => { const m = window.__lw.mpTest; const out = [];
          m.umgebungSetzen('0.77.0', { grund: '3', 'strassen-noe': '2' });
          out.push(m.umgebungPruefen('0.77.0', { grund: '3', 'strassen-noe': '2' }));
          out.push(m.umgebungPruefen('0.78.0', { grund: '3' }));
          out.push(m.umgebungPruefen('0.76.0', { grund: '3' }));
          out.push(m.umgebungPruefen('0.77.0', { grund: '3', 'strassen-noe': '2', 'strassen-wien': '1' }));
          out.push(m.umgebungPruefen('0.77.0', { grund: '4', 'strassen-noe': '2' }));
          m.umgebungSetzen('Browser', null); return out; }""")
        print("   ", r)
        check(r[0] is None, "gleiche Version und Pakete: beitreten")
        check(r[1] and r[1]["update"] and "aktualisieren" in r[1]["text"], "Host neuer: Update vorschlagen")
        check(r[2] and not r[2]["update"] and "Host muss" in r[2]["text"], "Host älter: Host muss aktualisieren")
        check(r[3] and r[3]["pakete"] == ["strassen-wien"] and "fehlt" in r[3]["text"], "fehlendes Kartenpaket: nicht beitreten")
        check(r[4] and r[4]["pakete"] == ["grund"] and "aktualisieren" in r[4]["text"], "veraltetes Kartenpaket: aktualisieren")
        A.evaluate(f"() => {{ const s={J}; const d=new Date(s.state.zeit); d.setHours(11,0,0,0); s.state.zeit=d.getTime(); }}")
        A.evaluate(f"() => {J}.call('start')"); A.wait_for_timeout(1500); A.evaluate(f"() => {J}.call('pause')")
        # --- NAH/RTW: weit weg → NAH fliegt, RTW frei; nah am KH → RTW fährt, NAH frei
        weit = A.evaluate(SZENARIO, [48.72, 16.38])
        print("   weit:", weit)
        check(weit["nah"]["einsatz"] and not weit["rtw"]["einsatz"] and weit["kh"], "weit vom Krankenhaus: NAH transportiert (Krankenhaus gebucht/angefragt), RTW frei")
        nah = A.evaluate(SZENARIO, [48.4106, 15.6034])
        print("   nah:", nah)
        check(nah["nah"]["einsatz"] and not nah["rtw"]["einsatz"], "RTW + NAH, Notarzt nötig: auch nahe am Krankenhaus übernimmt der NAH, RTW frei (Regel 0.85)")
        check(not logs, f"keine Fehler im Programm {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print(f"FEHLER: {fails}")
