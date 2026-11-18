# Beta 65 (Paul 18.11.2026): Fahrzeuge auf der Karte des Piloten (eigener Einsatz hervorgehoben, andere nur solange sie
# fahren, grau) – im PC-Fenster und in den Tablet-Daten (EFB, H145, X-Plane-Plugin); Optik des Pilotenfensters
# (Zielort ohne farbigen Rahmen, Zustand als Marke, Zeiten als Zeitleiste, Leiste links breit genug).
# Aufruf: python3 beta65test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8965", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

START = r"""async () => {
  const L = window.__lw; const s = L.sim;
  const warte = async (f, ms = 20000) => { const bis = Date.now() + ms; while (Date.now() < bis) { try { const x = f(); if (x) return x; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); } return null; };
  await warte(() => Object.keys(s.state.fahrzeuge).length);
  const ich = s.wer(); s.pilotTestStarten({ pid: ich.pid, name: ich.name || 'Pilot' });
  await warte(() => Object.keys(s.state.fahrzeuge).length); await new Promise((r) => setTimeout(r, 800));
  const d = new Date(s.state.zeit); d.setHours(10, 0, 0, 0); s.state.zeit = d.getTime(); s.setWetter('klar');
  const h = Object.values(s.state.fahrzeuge).find((f) => f.funkrufname === '99/002') || Object.values(s.state.fahrzeuge).find((f) => f.kategorie === 'NAH');
  await s.call('pilotUebernehmen', h.id); s.pilotTestGebiet(h.id);
  if (L.hauptmenue.offen()) L.hauptmenue.schliessen(false);
  await L.pilotUi.oeffnen(); window.__heli = h.id; return h.funkrufname; }"""
S = "window.__lw.sim"
KARTE = "() => window.__pilotKarte ? window.__pilotKarte() : null"
TAB = "() => (window.__pilot.handy().neu.tab || {}).karte || null"

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for thema in ("dunkel", "hell"):
            ctx = b.new_context(viewport={"width": 1600, "height": 950})
            ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema:'%s', einfuehrung:true})); })()" % thema)
            g = ctx.new_page(); g.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
            g.goto("http://localhost:8965/?debug&seed=65"); g.wait_for_timeout(2500)
            print(f"    [{thema}] Heli", g.evaluate(START)); g.wait_for_timeout(1500)
            # ---- ohne Einsatz: andere fahrende Fahrzeuge (Verlegung) grau, stehende nicht
            verlegt = g.evaluate(f"""async () => {{ const s = {S}; const h = s.state.fahrzeuge[window.__heli];
              const frei = Object.values(s.state.fahrzeuge).filter((x) => x.status === 'freiWache' && x.id !== h.id && !x.einsatzId && x.rmTyp !== 'NAH')
                .sort((a, b) => Math.hypot(a.lat - h.lat, a.lon - h.lon) - Math.hypot(b.lat - h.lat, b.lon - h.lon)).slice(0, 3);
              for (const x of frei) await s.call('verlegen', x, {{ lat: x.lat + 0.05, lon: x.lon + 0.07, label: 'Test', funk: 'Test' }});
              return frei.map((x) => x.funkrufname); }}""")
            g.wait_for_timeout(2500)
            k = g.evaluate(KARTE) or {}
            fz = k.get("fz") or []
            rufe = [x["ruf"] for x in fz]
            check(all(r in rufe for r in verlegt) and all(not x["mit"] and x["farbe"] == "#8A93A3" for x in fz if x["ruf"] in verlegt), f"[{thema}] PC-Karte: fahrende Fahrzeuge grau ({', '.join(verlegt)})")
            stehend = g.evaluate(f"() => Object.values({S}.state.fahrzeuge).filter((x) => !x.fahrt && x.status === 'freiWache' && x.id !== window.__heli).length")
            check(len(fz) == len(verlegt) and stehend > 10, f"[{thema}] PC-Karte: stehende Fahrzeuge nicht gezeigt ({len(fz)} gezeigt, {stehend} stehen)")
            t = g.evaluate(TAB) or {}
            tf = t.get("fz") or []
            check(any(x["ruf"] in verlegt and not x["ein"] and x["f"] == "#8A93A3" for x in tf), f"[{thema}] Tablet-Karte ohne Einsatz: fahrende Fahrzeuge grau")
            # ---- Einsatz: Fahrzeuge des Einsatzes in Statusfarbe, mit Rufname
            print("    Einsatz", g.evaluate(f"async () => {{ try {{ return await {S}.call('pilotTestEinsatz', window.__heli, 'normal'); }} catch (e) {{ return 'X ' + e.message; }} }}"))
            g.wait_for_timeout(6500)
            g.evaluate(f"async () => {{ await {S}.call('pilotStatus', window.__heli, 'alarmiert'); await {S}.call('pilotStatus', window.__heli, 'zumBO'); }}"); g.wait_for_timeout(2000)
            mit = g.evaluate(f"""() => {{ const s = {S}; const h = s.state.fahrzeuge[window.__heli]; const e = s.einsatz(h.einsatzId);
              return e.fahrzeuge.map((id) => s.state.fahrzeuge[id]).filter((x) => x && x.id !== h.id && x.einsatzId === e.id).map((x) => x.funkrufname); }}""")
            k = g.evaluate(KARTE) or {}
            fz = k.get("fz") or []
            m = [x for x in fz if x["mit"]]
            check(len(mit) >= 1 and sorted(x["ruf"] for x in m) == sorted(mit) and all(x["farbe"] != "#8A93A3" for x in m), f"[{thema}] PC-Karte: Fahrzeuge des Einsatzes hervorgehoben ({', '.join(mit)})")
            # (ein verlegtes Fahrzeug kann selbst zum Einsatz alarmiert worden sein – dann zählt es zum Einsatz)
            check(all(not x["mit"] for x in fz if x["ruf"] in verlegt and x["ruf"] not in mit), f"[{thema}] PC-Karte: andere bleiben grau")
            t = g.evaluate(TAB) or {}
            tf = t.get("fz") or []
            check(sorted(x["ruf"] for x in tf if x["ein"]) == sorted(mit) and tf and tf[-1]["ein"], f"[{thema}] Tablet-Karte: Einsatz-Fahrzeuge hervorgehoben (und oben gezeichnet)")
            # ---- Optik
            o = g.evaluate("""() => {
              const z = document.querySelector('.pvn-ziel'), tag = z && z.querySelector('.pvn-tag');
              const cs = z ? getComputedStyle(z) : null, ts = tag ? getComputedStyle(tag) : null;
              const zk = document.querySelector('.pvn-zeitk'), vk = document.querySelector('.pvn-verk');
              const zr = [...document.querySelectorAll('.pvn-zeitk .pvn-zr')].map((x) => x.getBoundingClientRect().top);
              const rail = [...document.querySelectorAll('.pvn-r')].map((x) => { const t = x.querySelector('span'); if (!t) return false; const r = document.createRange(); r.selectNodeContents(t); return r.getBoundingClientRect().width <= x.clientWidth - 2; });
              const leg = document.querySelector('.pv-kleg') ? document.querySelector('.pv-kleg').textContent : '';
              return { rahmen: cs ? cs.boxShadow : '', tagBg: ts ? ts.backgroundColor : '', zeitBreit: zk && vk ? Math.abs(zk.getBoundingClientRect().width - vk.getBoundingClientRect().width) < 2 : false,
                zeitReihe: zr.length === 7 && new Set(zr.map((y) => Math.round(y))).size === 1, rail: rail.length >= 3 && rail.every(Boolean), leg }; }""")
            check(o["tagBg"] not in ("", "rgba(0, 0, 0, 0)") and "255, 199" not in o["rahmen"] and "251, 192" not in o["rahmen"], f"[{thema}] Zielort ohne gelben Rahmen, Zustand als Marke")
            check(o["zeitBreit"] and o["zeitReihe"], f"[{thema}] Zeiten als Zeitleiste über die ganze Breite (7 nebeneinander)")
            check(o["rail"], f"[{thema}] Leiste links: Beschriftungen passen")
            check("dein Einsatz" in o["leg"] and "unterwegs" in o["leg"], f"[{thema}] Legende mit „dein Einsatz“ und „unterwegs“")
            # Maus über ein graues Fahrzeug → Rufname und Status
            pt = g.evaluate("""(ruf) => { const m = window.__pilotMap; const f = (window.__pilotKarte().fz || []).find((x) => x.ruf === ruf);
              const src = (window.__pilotKarte().fz || []); if (!m) return null;
              const fz = Object.values(window.__lw.sim.state.fahrzeuge).find((x) => x.funkrufname === ruf); if (!fz) return null;
              m.jumpTo({ center: [fz.lon, fz.lat], zoom: 12 });
              const p = m.project([fz.lon, fz.lat]); const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; }""", verlegt[0])
            g.wait_for_timeout(1200)
            tiptext = ""
            if pt:
                g.mouse.move(pt["x"] + 1, pt["y"] + 1); g.wait_for_timeout(400)
                tiptext = g.evaluate("() => { const t = document.querySelector('.pv-ktip'); return t && !t.hidden ? t.textContent : ''; }")
            check(any(v in tiptext for v in verlegt) and "·" in tiptext, f"[{thema}] Maus über Fahrzeug zeigt Rufname und Status ({tiptext})")
            ctx.close()
        print("    LOGS", json.dumps([l for l in logs][:6], ensure_ascii=False))
        check(not logs, "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
