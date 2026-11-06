import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8794", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails=0; logs=[]
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails+=1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('lw.abfrageAnsicht','klassisch'); localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8794/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        n = A.evaluate("() => window.__lw.store.list('hospitals').length")
        check(n >= 105, f"Krankenhäuser: {n}")
        # Vorschläge
        def vor(lat, lon, bu, rot):
            return A.evaluate("([lat, lon, bu, rot]) => window.__lw.sim.khFuer({lat, lon}, bu, rot).slice(0, 4).map(v => v.h.kurzname + ':' + v.eignung + ':' + Math.round(v.km))", [lat, lon, bu, rot])
        STP = (48.2047, 15.6256); KREMS = (48.4102, 15.6036); TULLN = (48.331, 16.056)
        r = vor(*STP, "bu_stemi", True); print("    STEMI St. Pölten:", r)
        check(r and "St. Pölten" in r[0] and ":passend" in r[0], "STEMI St. Pölten → UK St. Pölten")
        r = vor(*KREMS, "bu_augenverletzung", False); print("    Auge Krems:", r)
        check(r and r[0].endswith(tuple("0123456789")) and ":passend" in r[0], "Auge → Haus mit Augenheilkunde")
        r = vor(*KREMS, "bu_schlaganfall", True); print("    Insult Krems:", r)
        check(r and "Krems" not in r[0], "Insult Krems → nicht Krems (keine Stroke Unit)")
        r = vor(*TULLN, "bu_exsikkose_synkope_az_verschlechterung", False); print("    AZ Tulln grün:", r)
        check(r and "Tulln" in r[0], "AZ-Verschlechterung Tulln → Tulln")
        r = vor(*KREMS, "bu_isolierte_extremitaetenverletzung", False); print("    Extremität Krems:", r)
        check(r and r[0].split(":")[1] in ("passend", "ausweich"), "Extremität: passend/Ausweich")
        r = vor(*STP, "bu_schwere_verbrennung", True); print("    Verbrennung:", r)
        check(r and "AKH" in r[0], "schwere Verbrennung → AKH")
        r = vor(48.70, 15.33, "bu_wirbelsaeulenverletzung_mit_neurologisch", True); print("    Wirbelsäule Waldviertel:", r)
        check(len(r) > 0, "Rückfall greift, wenn nichts erreichbar ist")
        r = vor(47.07, 15.44, "bu_internistischer_kindernotfall", False); print("    Kind Graz:", r)
        check(not any("PK " in x or "Privat" in x for x in r), "keine Privatklinik für die Rettung")
        # Verdacht im Einsatz: Transport bis Buchung
        A.evaluate("() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        res = A.evaluate("""async () => { const s = window.__lw.sim; const out = []; for (let i = 0; i < 40; i++) { const e = await s.generiere(); if (!e) continue; e.wahr.transport = true; out.push([s.verdacht(e), e.wahr.abfrage ? e.wahr.abfrage.kapitel : '', s.naechstesKh(e.wahr, s.verdacht(e), s.patientRot(e))?.kurzname]); } return out; }""")
        from collections import Counter
        c = Counter(x[0] for x in res); print("    Verdachte:", dict(c))
        check(len(res) > 25 and all(x[2] for x in res), "jeder Einsatz bekommt Verdacht und Krankenhaus")
        # ganzer Ablauf
        r = A.evaluate("""() => { const s = window.__lw.sim; const e = s.state.einsaetze.find(x => x.wahr.abfrage); e.anruf.status = 'beendet';
            s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
            const rtw = Object.values(s.state.fahrzeuge).filter(f => f.kategorie === 'RTW' && s.verfuegbar(f)).sort((a, b) => Math.hypot(a.lat - e.wahr.lat, a.lon - e.wahr.lon) - Math.hypot(b.lat - e.wahr.lat, b.lon - e.wahr.lon))[0];
            e.wahr.transport = true; s.alarmiere(e.id, [rtw.id]); s.setTempo(60); s.start(); return e.id; }""")
        kh = None
        for i in range(90):
            A.wait_for_timeout(1000)
            z = A.evaluate("(id) => { const e = window.__lw.sim.einsatz(id); return { kh: e.kh, anfrage: e.khAnfrage, verdacht: e.verdacht, funk: e.protokoll.map(p => p.text).filter(t => /KH|bucht/.test(t)) }; }", r)
            if z["anfrage"] and not z["kh"]:
                print("    Anfrage:", z["anfrage"])
                A.evaluate("(id) => { const s = window.__lw.sim; const e = s.einsatz(id); const v = s.khFuer(e.adresse, e.khAnfrage.verdacht, true)[0]; s.bucheKh(id, v.h.id, e.khAnfrage.verdacht); }", r)
            if z["kh"]:
                kh = z; break
        print("   ", kh)
        check(kh is not None and bool(kh["kh"]["grund"]), "Krankenhaus mit Verdacht gebucht")
        check(kh is not None and any("Verdacht" in f for f in kh["funk"]) or (kh and kh["kh"]["durch"] == "dispo"), "Funk nennt den Verdacht")
        A.evaluate("() => window.__lw.sim.pause()")
        # Maske: KH-Auswahl
        A.locator(".el-row:has(.el-typ.rd)").first.click(); A.wait_for_timeout(800)
        A.select_option(".kh-verdacht", "bu_stemi"); A.wait_for_timeout(300)
        opts = A.evaluate("() => [...document.querySelectorAll('.kh-sel option')].slice(0, 4).map(o => o.textContent)")
        print("    Auswahl:", opts)
        check(any("passend" in o for o in opts), "Auswahl zeigt „passend“")
        check(A.locator(".kh-dring").count() == 1, "Dringlichkeit wird angezeigt")
        A.screenshot(path=f"{S}/kh_maske.png")
        # Editor
        A.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")
        ok = A.evaluate("() => { const h = window.__lw.store.list('hospitals').find(x => x.id === 'kh002'); return !!h && h.einrichtungen.length > 20; }")
        check(ok, "Krems hat Einrichtungen")
        csv = A.evaluate("async () => { const m = await import('/assets/index.js').catch(() => null); return null; }")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:10]))
