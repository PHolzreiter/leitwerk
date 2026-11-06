import subprocess, sys, time, json
from collections import Counter
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
NUR = sys.argv[3] if len(sys.argv) > 3 else "alles"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8797", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
        A.on("console", lambda m: logs.append(f"CONSOLE {m.text}") if m.type in ("warning", "error") and "Fallkatalog" in m.text else None)
        A.goto("http://localhost:8797/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.settings.khGrundAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        # 1) Prüfprogramm
        bef = A.evaluate("() => window.__lw.faellePruefen()")
        for x in bef[:40]: print("   ", x)
        check(len(bef) == 0, f"Prüfprogramm: {len(bef)} Befunde")
        # 2) Generator: alles aus dem Katalog, stimmig
        res = A.evaluate("""async () => { const s = window.__lw.sim; const out = []; for (let i = 0; i < 60; i++) { const e = await s.generiere(); if (!e) continue; const w = e.wahr.abfrage; const l = e.wahr.lage;
            out.push({ fall: l?.fall?.id, v: l?.fall?.variante, bw: w?.antworten.bw, at: w?.antworten.at, code: e.wahr.code, sz: !!w?.szenario, hergang: w?.szenario?.hergang }); } return out; }""")
        c = Counter(x["fall"] for x in res); print("    Fälle:", dict(c))
        check(len(res) >= 50 and all(x["fall"] for x in res), f"Generator nimmt den Katalog ({len(res)})")
        check(all(x["sz"] for x in res), "jede Einsatz hat eine Fallgeschichte")
        check(not any(x["bw"] == "ja" and x["at"] in ("agonal", "keine") for x in res), "kein „wach + Schnappatmung“")
        check(not any("[" in (x["hergang"] or "") or "{" in (x["hergang"] or "") for x in res), "Hergang ohne Platzhalter")
        bs = [x for x in res if x["fall"] == "brustschmerz"]
        print("    Brustschmerz:", [(x["v"], x["hergang"][:60]) for x in bs[:4]])
        check(all(("sticht" in x["hergang"]) == (x["v"] == "0") for x in bs), "Hergang passt zur Variante")
        if NUR == "kurz":
            raise SystemExit
        # 3) Anleitung am Telefon wird erkannt
        r = A.evaluate("""async () => { const s = window.__lw.sim; const e = await s.generiereFall('fk_kleinkind', 'C'); s.anrufAnnehmen(e.id);
            s.anrufNachricht(e.id, 'leitstelle', 'Wie alt ist das Kind?');
            s.anrufNachricht(e.id, 'leitstelle', 'Legen Sie ihn bäuchlings über Ihren Unterarm und schlagen Sie fünfmal kräftig zwischen die Schulterblätter.');
            return Object.keys(e.wahr.lage.fall.anleitungen); }""")
        print("    Anleitungen:", r)
        check(r == ["fremdkoerper"], "Fremdkörper-Manöver erkannt, Frage nicht")
        r = A.evaluate("""async () => { const s = window.__lw.sim; const e = await s.generiereFall('kollaps', 'A'); s.anrufAnnehmen(e.id);
            s.anrufNachricht(e.id, 'leitstelle', 'Drücken Sie bitte fest auf die Wunde.');
            s.anrufNachricht(e.id, 'leitstelle', 'Hat er Zucker?');
            return Object.keys(e.wahr.lage.fall.anleitungen); }""")
        check(r == ["druck_blutung"], f"Druck auf Wunde ≠ Reanimation, Frage nach Zucker keine Anleitung ({r})")
        # 4) Ablauf: Fall mit Kompetenz (Asthma A: NA nur bei RS)
        def ablauf(fall, var, quali, mitNef=False, sek=120, anfordern=False):
            eid = A.evaluate("""async ([fall, v, q, nef, anf]) => { const s = window.__lw.sim; const e = await s.generiereFall(fall, v); e.anruf.status = 'beendet';
                s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
                const frei = Object.values(s.state.fahrzeuge).filter(f => s.verfuegbar(f));
                const d = (f) => Math.hypot(f.lat - e.wahr.lat, f.lon - e.wahr.lon);
                const rtw = frei.filter(f => f.kategorie === 'RTW').sort((a, b) => d(a) - d(b))[0];
                rtw.besetzung = [{ rolle: 'Fahrer', quali: 'RS' }, { rolle: 'Transportführer', quali: q }];
                const ids = [rtw.id];
                if (nef) ids.push(frei.filter(f => f.kategorie === 'NEF').sort((a, b) => d(a) - d(b))[0].id);
                s.alarmiere(e.id, ids); if (anf) rtw.lagemeldungAngefordert = true; s.setTempo(60); s.start(); return e.id; }""", [fall, var, quali, mitNef, anfordern])
            out = None; z = None
            for i in range(sek):
                A.wait_for_timeout(1000)
                z = A.evaluate("(id) => { const e = window.__lw.sim.einsatz(id); return { nf: (e.nachforderungen || []).map(n => n.art), funk: (e.wahr.lage.verlauf || []).map(v => v.text).filter(t => /^\\S+\\/\\S+: /.test(t)) }; }", eid)
                if z["funk"]:
                    out = z
                    break
            A.evaluate("() => window.__lw.sim.pause()")
            # seit v0.42 meldet nicht jeder Einsatz eine Lage – ohne Meldung zählen die Nachforderungen
            return out if out is not None else z
        z = ablauf("asthma", "A", "RS")
        print("    Asthma mit RS:", z)
        check(z is not None and "NA" in z["nf"], "Asthma, nur RS vor Ort → NA nachgefordert")
        z = ablauf("asthma", "A", "NFS")
        print("    Asthma mit NFS:", z)
        check(z is not None and "NA" not in z["nf"], "Asthma, NFS vor Ort → kein NA")
        z = ablauf("brustschmerz", "0", "NFS-NKV", mitNef=True, anfordern=True)
        print("    Brustschmerz unauffällig mit NEF:", z)
        check(z is not None and "NA" not in z["nf"] and not any("benötigen Notarzt" in f for f in z["funk"]), "unauffälliger Brustschmerz → kein NA nötig (Storno, wenn er noch fährt)")
        check(z is not None and any("Mann" in f or "Frau" in f for f in z["funk"]) and any("EKG unauffällig" in f for f in z["funk"]), "Lagemeldung mit Lagebild aus dem Fall")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:15]))
