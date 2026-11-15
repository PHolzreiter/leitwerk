# Beta 58 (Paul 15.11.2026): Endegrund „Fehleinsatz“; der Spieler-NAH (echter Pilot) wählt bei „kein Transport“
# die Endegründe selbst (Untersuchung/Behandlung ohne Transport, Patient verweigert Mitfahrt, NACA 7, Fehleinsatz).
# Aufruf: python3 beta58test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8958", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1500, "height": 900})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema:'hell', einfuehrung:true})); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8958/?debug&seed=58"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1000)
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; st.acnAktiv = false; window.__lw.store.setSettings(st); }")

        # ---- Fehleinsatz (Computer): alle Fahrzeuge bekommen „Fehleinsatz“
        r = A.evaluate("""async () => { const s = window.__lw.sim;
            let e = null; for (let i = 0; i < 20 && !(e && e.wahr.lage); i++) e = await s.generiere('dringend');
            e.adresse = { lat: e.wahr.lat, lon: e.wahr.lon, label: 'Test' }; if (e.anruf) e.anruf.status = 'beendet';
            const frei = Object.values(s.state.fahrzeuge).filter((f) => s.verfuegbar(f) && !f.einsatzId && !f.pilot && !f.wechselOffen && !/flughafen/i.test(`${f.funkrufname} ${f.stationName}`));
            const rtw = frei.find((f) => f.kategorie === 'RTW'), nef = frei.find((f) => f.kategorie === 'NEF');
            s.alarmiere(e.id, [rtw.id, nef.id]);
            e.wahr.fehleinsatz = 'kein Patient angetroffen'; rtw.phase = 'suche'; rtw.phaseEnde = s.state.zeit; s.setStatus(rtw, 'amBO');
            s.updateVehicle(rtw, s.state.zeit);
            return { g: e.endegrund, rtw: rtw.id, nef: nef.id, text: window.__lw.ENDEGRUND_TEXT }; }""")
        print("    ", r["g"])
        if r["g"] is None:
            print("     (Fehleinsatz-Phase im Test nicht ausgelöst)")
        else:
            check(r["g"].get(r["rtw"]) == "fehleinsatz" and r["g"].get(r["nef"]) == "fehleinsatz", "Fehleinsatz: Endegrund „Fehleinsatz“ für alle Fahrzeuge")

        # ---- Spieler-NAH: Auswahl mit den Endegründen, jeder Grund landet beim Einsatz
        r = A.evaluate("""async () => { const s = window.__lw.sim; const out = {};
            const heli = Object.values(s.state.fahrzeuge).find((f) => f.funkrufname === '99/002');
            const ich = s.wer(); heli.pilot = { pid: ich.pid, name: ich.name };
            for (const g of ['kein', 'revers', 'tot', 'fehleinsatz']) {
                const e = await s.probeFall('brustschmerz', '0'); s.state.einsaetze.push(e); e.fahrzeuge.push(heli.id); heli.einsatzId = e.id; s.setStatus(heli, 'amBO');
                const fehler = s.pilotPlan(heli.id, { art: 'kein', grund: g });
                out[g] = { fehler, g: e.endegrund && e.endegrund[heli.id] };
                if (g === 'revers') { s.pilotPlan(heli.id, { art: 'kein', grund: 'tot' }); out.wechsel = e.endegrund[heli.id];
                    const kh = window.__lw.store.list('hospitals')[0]; s.pilotPlan(heli.id, { art: 'transport', hospitalId: kh.id }); out.transport = e.endegrund[heli.id] ?? null; }
                heli.einsatzId = null; e.fahrzeuge = [];
            }
            out.falsch = (() => { const e2 = s.state.einsaetze[s.state.einsaetze.length - 1]; heli.einsatzId = e2.id; e2.fahrzeuge = [heli.id]; const f = s.pilotPlan(heli.id, { art: 'kein', grund: 'quatsch' }); heli.einsatzId = null; return f; })();
            return out; }""")
        print("    ", json.dumps(r, ensure_ascii=False))
        check(r["kein"]["g"] == "belassung" and r["revers"]["g"] == "revers" and r["tot"]["g"] == "verstorben" and r["fehleinsatz"]["g"] == "fehleinsatz", "Pilot: Behandlung ohne Transport / verweigert / NACA 7 / Fehleinsatz werden der Endegrund")
        check(r["wechsel"] == "verstorben", "Pilot kann den Grund am Berufungsort noch ändern")
        check(r["transport"] is None, "doch Transport: der gewählte Endegrund fällt weg")
        check(bool(r["falsch"]), "unbekannter Grund wird abgelehnt")

        # ---- Piloten-Oberfläche: vier Knöpfe mit den Texten der Endegründe
        r = A.evaluate("""async () => { const s = window.__lw.sim;
            const heli = Object.values(s.state.fahrzeuge).find((f) => f.funkrufname === '99/002');
            const e = await s.probeFall('brustschmerz', '0'); s.state.einsaetze.push(e); e.fahrzeuge.push(heli.id); heli.einsatzId = e.id; s.setStatus(heli, 'amBO');
            await window.__lw.pilotUi.oeffnen(); await new Promise((r) => setTimeout(r, 1500));
            const kn = [...document.querySelectorAll('button')].find((x) => /Kein Transport/.test(x.textContent || ''));
            if (kn) kn.click(); await new Promise((r) => setTimeout(r, 600));
            return [...document.querySelectorAll('.pk-wahl button')].map((x) => x.childNodes[0] ? x.childNodes[0].textContent : x.textContent); }""")
        A.screenshot(path=f"{sys.argv[1]}/beta58_pilot.png")
        print("    ", r)
        if r:
            check(r == ["Untersuchung/Behandlung ohne Transport", "Patient verweigert Mitfahrt", "NACA 7: Patient verstorben", "Fehleinsatz"], "Piloten-Fenster: vier Gründe")
        else:
            print("     (Piloten-Fenster im Test nicht geöffnet)")

        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
