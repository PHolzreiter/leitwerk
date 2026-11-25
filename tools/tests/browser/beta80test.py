# Beta 80 (Paul 25.11.2026): Rufhilfe-Alarme nimmt standardmäßig eine externe Stelle auf – sie kommen als fertiger
# Einsatz (Adresse, Code RD-32B2, Erstaufnahme, Info an den RTW), nur noch zu disponieren; kein Rückruf; rein versehentliche
# Alarme fallen weg; Einstellung „Selbst aufnehmen“. Ton „Einsatz rein“ bei jedem Disponenten, wenn eine Aufnahme endet.
# Aufruf: python3 beta80test.py <arbeitsordner> <web-build>
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8980", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A.goto("http://localhost:8980/?debug&seed=8980"); A.wait_for_timeout(2500)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        check(A.evaluate("() => window.__lw.sim.settings.rufhilfeAufnahme ?? 'extern'") == "extern", "Standard: Rufhilfe kommt als fertiger Einsatz")

        # 1) Sturz mit Sprechkontakt (Hüfte)
        t0 = A.evaluate("() => window.__lw.tonZaehler.einsatzRein ?? 0")
        r = A.evaluate("""async () => { const s = window.__lw.sim; const e0 = await s.generiereFall('rufhilfe_sturz', 'B'); const e = s.einsatz(e0.id);
            const w = e.wahr.abfrage.antworten;
            return { aufnahme: e.aufnahme, status: e.anruf.status, wer: e.anruf.angenommenVon && e.anruf.angenommenVon.name, adr: e.adresse && e.adresse.label, wahrAdr: e.wahr.adresse,
              bo: !!e.bo, code: e.code, zustand: e.zustand, fz: e.fahrzeuge.length, info: e.infoRtw, safe: w.rh_safe_nr, telefon: e.telefon || '', id: e.id,
              prot: e.protokoll.map(p => p.text).join('\\n'), funk: s.state.funk.slice(-3).map(f => f.text).join(' | ') }; }""")
        print("    Info:", r["info"]); print("    Protokoll:\n      " + r["prot"].replace("\n", "\n      "))
        check(r["aufnahme"] == "extern" and r["status"] == "beendet" and r["wer"] == "Externe Annahme (Rufhilfe)", f"fertig aufgenommen, Gespräch beendet ({r['status']}, {r['wer']})")
        check(r["adr"] == r["wahrAdr"] and r["bo"], f"Adresse eingetragen ({r['adr']})")
        check(r["code"] == "RD-32B2" and r["zustand"] in ("neu", "offen") and r["fz"] == 0, f"Code {r['code']}, noch zu disponieren ({r['zustand']}, {r['fz']} Fahrzeuge)")
        check("B+" in r["info"] and "A+" in r["info"] and "Hüfte" in r["info"] and "//" in r["info"], "Info an den RTW mit Alter, B/A und Was ist passiert")
        check("Aufgenommen von: Externe Annahme (Rufhilfe)" in r["prot"] and "Erstaufnahme" in r["prot"] and f"Schlüsselsafe Nummer: {r['safe']}" in r["prot"] and "Was ist passiert: Gestürzt" in r["prot"] and "Sprechverbindung zur Person besteht" in r["prot"], "Erstaufnahme wie selbst aufgenommen (Rufhilfe, Schlüsselsafe, Was ist passiert)")
        check("Notruf klingelt" not in r["prot"] and "Rufhilfe-Alarm eingegangen" in r["prot"], "es klingelt nicht")
        check("fertig aufgenommen" in r["funk"], f"Meldung „Neuer Einsatz … (Rufhilfe, fertig aufgenommen)“")
        A.wait_for_timeout(1200)
        t1 = A.evaluate("() => window.__lw.tonZaehler.einsatzRein ?? 0")
        check(t1 == t0 + 1, f"Ton „Einsatz rein“ einmal ({t0} → {t1})")

        # 2) kein Rückruf, nicht im Telefon
        r2 = A.evaluate("""(id) => { const s = window.__lw.sim; let fehler = ''; try { s.anrufAnnehmen(id); } catch (x) { fehler = String(x.message || x); }
            return { fehler, status: s.einsatz(id).anruf.status, rueck: s.rueckruf(id) }; }""", r["id"])
        check("kein Rückruf" in r2["fehler"] and r2["status"] == "beendet" and r2["rueck"] is None and not r["telefon"], f"Rückruf nicht möglich ({r2['fehler']})")
        A.evaluate("() => window.__lw.ui && window.__lw.ui.fenster && window.__lw.ui.fenster('telefon')")

        # 3) keine Sprechverbindung: Bewusstsein/Atmung unbekannt, „kein Kontakt“
        r = A.evaluate("""async () => { const s = window.__lw.sim; const e0 = await s.generiereFall('rufhilfe_still', 'C'); const e = s.einsatz(e0.id);
            return { a: e.anruf.antworten, code: e.code, info: e.infoRtw, prot: e.protokoll.map(p => p.text).join('\\n') }; }""")
        print("    Info:", r["info"])
        check(r["a"].get("rh_kontakt") == "nein" and r["a"].get("bw") == "unbekannt" and r["a"].get("at") == "unbekannt" and r["code"] == "RD-32B2", "keine Sprechverbindung: B/A unbekannt, RD-32B2")
        check("keine Sprechverbindung" in r["info"] and "B?" in r["info"], f"Info: kein Kontakt ({r['info']})")

        # 4) alle Rufhilfe-Fälle haben einen Text (außer rein versehentlich)
        r = A.evaluate("""() => { const L = window.__lw; return L.faelle.alleFaelle().filter(f => f.gruppe === 'rufhilfe').map(f => ({ id: f.id, t: f.varianten.map(v => L.externText(f, v.id)) })); }""")
        for f in r:
            if f["id"] == "rufhilfe_versehen": check(all(t == "" for t in f["t"]), "rein versehentlich: kein Text (fällt weg)")
            else: check(all(len(t) > 10 for t in f["t"]), f"{f['id']}: Text für jede Variante ({f['t'][0][:50]}…)")

        # 5) Ziehen: extern nie „rein versehentlich“, selbst schon
        r = A.evaluate("""() => { const L = window.__lw, s = L.sim; const out = {}; s.settings.aufkommenStufe = 'realistisch';
            for (const m of ['extern', 'selbst']) { s.settings.rufhilfeAufnahme = m; let rh = 0, vers = 0;
              for (let h = 0; h < 24; h++) { s.state.zeit = new Date(2026, 9, 14, h, 30).getTime();
                for (let i = 0; i < 120; i++) { const k = s.fallAusKatalog(L.store.schema); const id = k && k.fall.katalog && k.fall.katalog.id; if (id && id.startsWith('rufhilfe')) rh++; if (id === 'rufhilfe_versehen') vers++; } }
              out[m] = { rh, vers }; }
            s.settings.rufhilfeAufnahme = 'extern'; s.settings.aufkommenStufe = 'standard'; return out; }""")
        print("    ", r)
        check(r["extern"]["vers"] == 0 and r["extern"]["rh"] > 20, f"extern: Rufhilfe kommt, aber nie rein versehentlich ({r['extern']})")
        check(r["selbst"]["vers"] > 0, f"selbst aufnehmen: versehentliche gibt es weiter ({r['selbst']})")

        # 6) Einstellung „Selbst aufnehmen“: klingelt wie bisher
        r = A.evaluate("""async () => { const s = window.__lw.sim; s.settings.rufhilfeAufnahme = 'selbst'; const e = await s.generiereFall('rufhilfe_sturz', 'A');
            const x = s.einsatz(e.id); const out = { status: x.anruf.status, aufnahme: x.aufnahme || null, adr: x.adresse }; x.anruf.status = 'verpasst'; s.settings.rufhilfeAufnahme = 'extern'; return out; }""")
        check(r["status"] == "klingelt" and r["aufnahme"] is None and r["adr"] is None, f"Selbst aufnehmen: klingelt als Notruf ({r})")

        # 7) Ton bei jedem beendeten Aufnahme-Telefonat (auch wenn es jemand anderer führt)
        t0 = A.evaluate("() => window.__lw.tonZaehler.einsatzRein ?? 0")
        A.evaluate("""async () => { const s = window.__lw.sim; const e = await s.generiereFall('kind_platzwunde');
            const vor = s.actor; s.actor = { pid: 'anderer', name: 'Kollegin' }; try { s.anrufAnnehmen(e.id); s.anrufBeenden(e.id); } finally { s.actor = vor; } }""")
        A.wait_for_timeout(1200)
        t1 = A.evaluate("() => window.__lw.tonZaehler.einsatzRein ?? 0")
        check(t1 == t0 + 1, f"Notruf von jemand anderem beendet: Ton „Einsatz rein“ ({t0} → {t1})")

        # 8) Einstellungsseite: Auswahl da
        A.evaluate("() => window.__lw.sim.settings.rufhilfeAufnahme = 'extern'")
        for l in logs[:5]: print("    ", l)
        check(not logs, "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
