import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8819", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(viewport={"width": 1700, "height": 1000}); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8819/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        tabs = A.evaluate("() => [...document.querySelectorAll('.dv-tab')].map(t => t.textContent.trim())")
        print("   ", tabs)
        check(any("Statusänderungen" in t for t in tabs), "Reiter „Statusänderungen“ ist da")
        r = A.evaluate("""() => { const s = window.__lw.sim; const fz = Object.values(s.state.fahrzeuge).find(f => f.status === 'freiWache' && !f.einsatzId);
          const vor = (s.state.statusLog ?? []).length; s.manualStatus(fz.id, 'abgemeldet'); const nach = s.state.statusLog ?? [];
          return { id: fz.id, name: fz.funkrufname, neu: nach.length - vor, letzt: nach[nach.length - 1] }; }""")
        print("   ", r)
        check(r["neu"] == 1 and r["letzt"]["nach"] == "abgemeldet" and r["letzt"]["grund"] == "von Hand", "Statusänderung wird gemerkt")
        A.wait_for_timeout(900)
        # Aktive Fahrzeuge zeigen den abgemeldeten Wagen nicht
        A.evaluate("() => window.__lw.panelZeigen('aktive')"); A.wait_for_timeout(900)
        txt = A.evaluate("() => document.querySelector('.fz-fenster.aktive')?.textContent ?? ''")
        alle0 = A.evaluate("() => Object.values(window.__lw.sim.state.fahrzeuge).filter(f => f.status === 'abgemeldet' && !f.einsatzId && !(f.kt && f.kt.aktiv)).map(f => f.funkrufname)")
        check(r["name"] not in txt and not any(n in txt for n in alle0[:30]), f"„Aktive Fahrzeuge“ ohne Status 0 ({len(alle0)} abgemeldet)")
        A.evaluate("() => window.__lw.panelZeigen('statuslog')"); A.wait_for_timeout(900)
        txt = A.evaluate("() => document.querySelector('.statuslog')?.textContent ?? ''")
        check(r["name"] in txt and "Abgemeldet" in txt, "„Statusänderungen“ zeigt den Wechsel")
        A.screenshot(path=f"{S}/v40_statuslog.png")
        # Reanimation: weiterzählen
        r = A.evaluate("""async () => { const L = window.__lw; L.kiPrefsSetzen({ ablauf: 'neu' });
          L.kiTest.chat = async (msgs, on) => { const t = 'Okay, bleib ich dran.'; on(t); return t; };
          const e = await L.sim.probeFall('kreislaufstillstand', 'rea'); e.anruf.status = 'aktiv'; const k = L.kontext(e); k.anrufer = { ...k.anrufer, selbst: false };
          const a1 = await L.anruferAntwort(e, k, 'Wenn sie soweit sind dann drücken sie regelmäßig fest in den Brustkorb');
          const k2 = L.kontext(e);
          const a2 = await L.anruferAntwort(e, k2, 'sehr gut machen sie das');
          L.kiTest.chat = null; return { a1, a2, m: e.wahr.abfrage.massnahmen }; }""")
        print("   ", r)
        check(sum(w in r['a1'].lower() for w in ['eins','zwei','drei','vier','fünf','sechs','sieben','acht','neun','zehn','elf','zwölf','zwanzig']) >= 3, 'beim ersten „drücken“ wird gezählt')
        check("Herzdruckmassage" in " ".join(r["m"] or []), "Herzdruckmassage wird gemerkt")
        check(sum(w in r["a2"].lower() for w in ["eins","zwei","drei","vier","fünf","sechs","sieben","acht","neun","zehn","elf","zwölf","zwanzig"]) >= 3 or any(c.isdigit() for c in r["a2"]), "bei „sehr gut“ wird weitergezählt")
        check(logs == [], f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
