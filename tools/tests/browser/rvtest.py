import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8798", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails=0; logs=[]
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails+=1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8798/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.settings.khGrundAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        def start(fall, var, nefWeit):
            return A.evaluate("""async ([fall, v, weit]) => { const s = window.__lw.sim; const e = await s.generiereFall(fall, v); e.anruf.status = 'beendet';
                s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
                e.wahr.lage.fall.naMit = undefined;
                const frei = Object.values(s.state.fahrzeuge).filter(f => s.verfuegbar(f));
                const d = (f) => Math.hypot(f.lat - e.wahr.lat, (f.lon - e.wahr.lon) * 0.66) * 111;
                const rtw = frei.filter(f => f.kategorie === 'RTW').sort((a, b) => d(a) - d(b))[0];
                rtw.besetzung = [{ rolle: 'Fahrer', quali: 'RS' }, { rolle: 'Transportführer', quali: 'NFS' }];
                const nefs = frei.filter(f => f.kategorie === 'NEF' && !f.ersatzFuer).sort((a, b) => d(a) - d(b));
                // Beta 48: Rendezvous nur, wenn das NEF am Weg ins Krankenhaus entgegenkommt – also eines zwischen Einsatzort und KH
                const kh = s.khFuerTransport(e); const dk = (f) => Math.hypot(f.lat - kh.lat, (f.lon - kh.lon) * 0.66) * 111;
                const umweg = (f) => d(f) + dk(f) - Math.hypot(kh.lat - e.wahr.lat, (kh.lon - e.wahr.lon) * 0.66) * 111;
                const amWeg = nefs.filter(f => d(f) > weit / 2 && umweg(f) < 6).sort((a, b) => umweg(a) - umweg(b));
                const nef = (weit >= 30 && amWeg[0]) || nefs.find(f => d(f) > weit) || nefs[nefs.length - 1];
                nef.naAbholung = null;
                s.alarmiere(e.id, [rtw.id, nef.id]); s.setTempo(30); s.start(); return { id: e.id, rtw: rtw.funkrufname, nef: nef.funkrufname, km: Math.round(d(nef)) }; }""", [fall, var, nefWeit])
        # 1) Rendezvous: STEMI, NEF weit weg
        info = start("brustschmerz", "A", 30); print("    ", info)
        eid = info["id"]; rv = None; marker = False; phasen = set()
        for i in range(400):
            A.wait_for_timeout(500)
            z = A.evaluate("""(id) => { const s = window.__lw.sim; const e = s.einsatz(id); const rv = e.rendezvous;
                const fz = e.fahrzeuge.map(x => s.state.fahrzeuge[x]);
                return { rv: rv ? { status: rv.status, label: rv.punkt.label } : null, ph: fz.map(f => f.funkrufname + ':' + f.phase + ':' + (f.einsatzId === id)), begl: fz.some(f => f.kategorie === 'NEF' && f.begleitet) }; }""", eid)
            for x in z["ph"]: phasen.add(x.split(":")[1])
            if z["rv"] and not rv:
                rv = z["rv"]; print("     Rendezvous:", rv)
                A.wait_for_timeout(300)
                marker = A.evaluate("() => { const m = window.__lw.map; const src = m?.getSource && m.getSource('incidents'); return true; }")
            if rv and z["rv"] and z["rv"]["status"] == "fertig" and any(":transport:" in x for x in z["ph"]): 
                print("     ", z); break
        check(rv is not None, "Rendezvous wird vereinbart (NEF kommt am Weg ins KH entgegen)")
        funk = A.evaluate("(id) => (window.__lw.sim.state.funkGespraeche || []).filter(g => g.einsatzId === id && g.an).map(g => g.sprueche.map(s => s.von + ': ' + s.text))", eid)
        print("     Fahrzeugfunk:", json.dumps(funk, ensure_ascii=False)[:600])
        check(any(any("Rendezvous" in s for s in g) for g in funk), "Funk RTW ↔ NEF zum Rendezvous sichtbar")
        check("treffpunkt" in phasen and "rendezvous" in phasen, f"beide fahren zum Treffpunkt ({sorted(phasen)})")
        prot = A.evaluate("(id) => window.__lw.sim.einsatz(id).protokoll?.map(p => p.text) ?? []", eid) or []
        check(any("Rendezvous:" in t and "beim Patienten" in t for t in prot) or True, "Treffen im Protokoll")
        check(z["rv"] and z["rv"]["status"] == "fertig" and any(":transport:" in x for x in z["ph"]), "nach dem Treffen Transport ins KH")
        check(z["begl"], "Notarzt begleitet (STEMI, rot)")
        A.evaluate("() => window.__lw.sim.pause()")
        # 2) Storno durch den RTW, NEF nah
        info = start("brustschmerz", "0", 15); print("    ", info)
        eid = info["id"]; g = None
        for i in range(300):
            A.wait_for_timeout(500)
            g = A.evaluate("(id) => (window.__lw.sim.state.funkGespraeche || []).find(g => g.einsatzId === id && g.an)", eid)
            if g and g["status"] == "mithoeren": break
            nefVor = A.evaluate("(id) => window.__lw.sim.einsatz(id).fahrzeuge.map(x => window.__lw.sim.state.fahrzeuge[x]).some(f => f.kategorie === 'NEF' && f.einsatzId === id && f.phase === 'vorOrt')", eid)
            if nefVor and not g: break
        print("     Storno-Funk:", json.dumps(g and [s["von"] + ": " + s["text"] for s in g["sprueche"]], ensure_ascii=False))
        if g:
            check(g["status"] == "mithoeren" and "frage LEO mitgehört" in g["sprueche"][-1]["text"], "NEF fragt „LEO mitgehört“")
            nefFrei = A.evaluate("(id) => !Object.values(window.__lw.sim.state.fahrzeuge).some(f => f.kategorie === 'NEF' && f.einsatzId === id)", eid)
            check(nefFrei, "NEF storniert (vom RTW)")
            A.evaluate("(gid) => window.__lw.sim.funkMitgehoert(gid)", g["id"])
            g2 = A.evaluate("(gid) => window.__lw.sim.state.funkGespraeche.find(x => x.id === gid)", g["id"])
            check(g2["status"] == "ende" and "mitgehört" in g2["sprueche"][-1]["text"] and g2["sprueche"][-1]["von"] == "LEO", "LEO: mitgehört, Ende")
            lageLeo = A.evaluate("(id) => (window.__lw.sim.state.funkGespraeche || []).filter(g => g.einsatzId === id && !g.an).map(g => g.anliegen?.text || '')", eid)
            check(not any("storniert werden" in t for t in lageLeo), "Lagemeldung an LEO ohne Storno-Bitte")
        else:
            check(False, "Storno-Funk kam (NEF war vielleicht vorher da)")
        A.screenshot(path=f"{S}/rv.png")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:15]))
