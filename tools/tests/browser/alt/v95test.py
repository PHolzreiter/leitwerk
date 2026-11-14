import subprocess, sys, time, json, re
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8819", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
FALL = """const e = await L.sim.probeFall('brustschmerz', '0'); e.anruf.status = 'aktiv'; const k = L.kontext(e); k.anrufer = { ...k.anrufer, selbst: false }; k.wahrheit.at = 'normal';"""
STREAM = """const strom = (text) => async (msgs, on) => { const c = msgs[msgs.length - 1].content; const t = /Korrektur/.test(c) ? 'Nein, nein, er atmet ganz normal.' : text; for (const w of t.split(/(?<= )/)) { await new Promise(r => setTimeout(r, 40)); on(w); } ende = performance.now(); return t; };"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8819/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        # 1) schnell: erster Satz geht raus, bevor die KI fertig ist; der falsche dritte Satz nie
        r = A.evaluate("""async () => { const L = window.__lw; L.kiPrefsSetzen({ ablauf: 'neu', schnell: true }); let ende = 0; """ + STREAM + """
          L.kiTest.chat = strom('Er atmet ganz normal. Er sitzt auf der Couch und schaut komisch. Er kriegt ganz schlecht Luft. Bitte kommen Sie schnell.');
          """ + FALL + """
          const t0 = performance.now(); const gezeigt = []; const q = { wert: 'ki' };
          const a = await L.anruferAntwort(e, k, 'atmet er noch normal', undefined, (t) => gezeigt.push([t, performance.now() - t0]), q);
          return { a, gezeigt, ende: ende - t0, q }; }""")
        print("   ", r)
        check(len(r["gezeigt"]) >= 2 and r["gezeigt"][0][1] < r["ende"] - 300, "schnell: erster Satz wird gezeigt/gesprochen, bevor die KI fertig ist")
        check(r["gezeigt"][0][0].endswith(" "), "schnell: freigegebener Satz endet mit Leerzeichen (Vorleser spricht ihn sofort)")
        check(not any("schlecht" in x[0] for x in r["gezeigt"]) and "schlecht" not in r["a"], "schnell: widersprüchlicher Satz wird nie gezeigt")
        check(r["a"].startswith("Er atmet ganz normal.") and "Couch" in r["a"], "schnell: Antwort = die freigegebenen Sätze")
        check("".join(x[0] for x in r["gezeigt"]).strip() == r["a"].strip(), "schnell: gezeigt = Antwort (nichts doppelt)")
        # 2) schnell, erster Satz falsch → wie bisher neu erzeugen, nichts Falsches zu hören
        r = A.evaluate("""async () => { const L = window.__lw; let ende = 0; """ + STREAM + """
          L.kiTest.chat = strom('Er kriegt ganz schlecht Luft. Er sitzt auf der Couch.');
          """ + FALL + """
          const gezeigt = []; const q = { wert: 'ki' };
          const a = await L.anruferAntwort(e, k, 'atmet er noch normal', undefined, (t) => gezeigt.push(t), q);
          return { a, gezeigt, q }; }""")
        print("   ", r)
        check("normal" in r["a"] and r["q"].get("nachgebessert") and not any("schlecht" in x for x in r["gezeigt"]), "schnell: falscher erster Satz → neu erzeugt, nie gezeigt")
        # 3) aus: wie bisher, alles auf einmal am Ende
        r = A.evaluate("""async () => { const L = window.__lw; L.kiPrefsSetzen({ schnell: false }); let ende = 0; """ + STREAM + """
          L.kiTest.chat = strom('Er atmet ganz normal. Er sitzt auf der Couch.');
          """ + FALL + """
          const gezeigt = []; const a = await L.anruferAntwort(e, k, 'atmet er noch normal', undefined, (t) => gezeigt.push(t), { wert: 'ki' });
          L.kiTest.chat = null; return { a, gezeigt, zeiten: L.antwortZeiten ? L.antwortZeiten.length : -1 }; }""")
        print("   ", r)
        check(len(r["gezeigt"]) == 1 and r["gezeigt"][0] == r["a"], "aus: Antwort erst nach der Prüfung, auf einmal (wie bisher)")
        # 4) Einstellung sichtbar
        A.evaluate("() => window.__lw.kiPrefsSetzen({ schnell: false })")
except Exception as ex:
    print("FEHLER Ausnahme", ex); fails += 1
finally:
    srv.terminate()
for l in logs: print(l)
print("FEHLER gesamt:", fails) if fails else print("ALLES OK")
