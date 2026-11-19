# Beta 68 (Paul 19.11.2026): mehrere Patienten, zwei RTW – der RTW, der den Notarzt nachgefordert hat, hat den kritischen
# Patienten (wartet auf den Notarzt, macht das Rendezvous); der andere RTW fährt mit seinem Patienten, ohne zu warten.
# Aufruf: python3 beta68test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8968", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8968/?debug&seed=8968"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.settings.khGrundAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        r = A.evaluate("""async () => { const s = window.__lw.sim;
            const e = await s.generiereFall('brustschmerz', 'A');
            e.anruf.status = 'beendet';
            s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }, code: e.wahr.code });
            const d = (f) => Math.hypot(f.lat - e.wahr.lat, (f.lon - e.wahr.lon) * 0.66) * 111;
            const frei = Object.values(s.state.fahrzeuge).filter(f => s.verfuegbar(f));
            const rtws = frei.filter(f => f.kategorie === 'RTW').sort((a, b) => d(a) - d(b)).slice(0, 2);
            const nef = frei.filter(f => f.kategorie === 'NEF' && !f.ersatzFuer).sort((a, b) => d(b) - d(a))[0];
            nef.naAbholung = null;
            s.alarmiere(e.id, [rtws[0].id, rtws[1].id, nef.id]);
            const t = s.state.zeit;
            // beide RTW vor Ort, das NEF noch weit weg
            for (const f of rtws) { f.lat = e.wahr.lat; f.lon = e.wahr.lon; f.fahrt = null; f.phase = 'vorOrt'; f.status = 'amBO'; f.vorOrtSeit = t; f.phaseEnde = t + 60000; }
            // RTW A fordert den Notarzt nach
            (e.nachforderungen ??= []).push({ art: 'NA', anzahl: 1, seit: t, von: rtws[0].funkrufname, erinnert: t, erledigt: true });
            const p0 = e.wahr.lage.patienten[0];
            const einer = { a: s.naRtwAnderer(e, rtws[0]), b: s.naRtwAnderer(e, rtws[1]) };
            e.wahr.lage.patienten = [p0, { ...p0, alter: 30, sichtung: 'gruen' }];
            const zwei = { a: s.naRtwAnderer(e, rtws[0]), b: s.naRtwAnderer(e, rtws[1]) };
            const wartetB = s.wartetAufNotarzt(rtws[1], e, t);
            const wartetA = s.wartetAufNotarzt(rtws[0], e, t);
            return { a: rtws[0].funkrufname, b: rtws[1].funkrufname, nef: nef.funkrufname, km: Math.round(d(nef)), einer, zwei, wartetA, wartetB, rv: e.naWarten ? e.naWarten.rv : null }; }""")
        print("   ", r)
        check(r["einer"] == {"a": False, "b": False}, "ein Patient: wie bisher (beide RTW gelten für den Patienten)")
        check(r["zwei"] == {"a": False, "b": True}, "zwei Patienten: nur der nachfordernde RTW hat den Notarzt-Patienten")
        check(r["wartetB"] is False, f"der andere RTW ({r['b']}) wartet nicht auf den Notarzt")
        check(r["wartetA"] is True, f"der nachfordernde RTW ({r['a']}) wartet auf den Notarzt bzw. macht das Rendezvous ({r['rv']})")
        print("    LOGS", json.dumps(logs[:6], ensure_ascii=False))
        check(not logs, "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
