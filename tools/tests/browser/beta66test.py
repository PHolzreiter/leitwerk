# Beta 66 (Paul 18.11.2026): Tablet-Alarm als kleines Fenster (Minimieren, 9 Quittieren, Zum BO; verschwindet auch bei
# Status über Funk/PC), Meldung „zu früh“ und Countdown im Tablet, „Funkgerät & Tablet verbinden“ als großes Fenster,
# RTW nach der Entscheidung des Piloten (NAH transportiert → RTW bald frei; NA im RTW → RTW fährt mit Status 4 los;
# kein Transport → beide frei), Testeinsätze 5–20 km nur ALS orange/rot und BLS/ALS aufwertbar, Fahrzeuge des
# Einsatzes blau mit Status-Ziffer, PC-Fenster zeigt alles, was das Tablet zeigt (Einheiten, Abfrage, Navigation …).
# Aufruf: python3 beta66test.py <arbeitsordner> <web-build> [efb.html]
import subprocess, sys, time, json, os, math
from playwright.sync_api import sync_playwright
ARB = sys.argv[1]
DIST = sys.argv[2]
HIER = os.path.dirname(os.path.abspath(__file__))
EFB = sys.argv[3] if len(sys.argv) > 3 else os.path.join(HIER, "../../../src-tauri/src/efb.html")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8966", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
# Spielzeit weiter (wie gstest.py)
SCHRITT = r"""async (n) => { const s = window.__lw.sim;
  for (let i = 0; i < n; i++) { s.state.zeit += 15000; const t = s.state.zeit;
    for (const fz of Object.values(s.state.fahrzeuge)) s.updateVehicle(fz, t);
    s.partnerTick(t); s.khTick(t); s.checkKhAnfragen(t); s.lageTick(t);
    await new Promise((r) => setTimeout(r, 4));
    for (let k = 0; k < 300 && s.routingBusy.size; k++) await new Promise((r) => setTimeout(r, 10)); } }"""
S = "window.__lw.sim"
EINSATZ = f"async () => {{ try {{ return await {S}.call('pilotTestEinsatz', window.__heli, 'normal'); }} catch (e) {{ return 'X ' + e.message; }} }}"
STATUS = f"() => {S}.state.fahrzeuge[window.__heli].status"
ST = f"async (k) => {{ try {{ return await {S}.call('pilotStatus', window.__heli, k); }} catch (e) {{ return 'X ' + e.message; }} }}"
AMORT = f"async () => {{ const s = {S}; await s.call('pilotStatus', window.__heli, 'zumBO'); const f = s.state.fahrzeuge[window.__heli]; const e = s.einsatz(f.einsatzId); f.lat = e.adresse.lat; f.lon = e.adresse.lon; await s.call('pilotStatus', window.__heli, 'amBO'); }}"
FREI = f"async () => {{ const s = {S}; for (const k of ['amZO','freiFunk','freiWache']) try {{ await s.call('pilotStatus', window.__heli, k); }} catch (e) {{}} }}"
ANDERE = f"""() => {{ const s = {S}; const h = s.state.fahrzeuge[window.__heli]; const e = s.einsatz(h.einsatzId) || s.state.einsaetze.find((x) => x.fahrzeuge.includes(h.id));
  return e.fahrzeuge.map((id) => s.state.fahrzeuge[id]).filter((x) => x && !x.pilot).map((x) => ({{ ruf: x.funkrufname, typ: x.kategorie, phase: x.phase, status: x.status, mit: x.einsatzId === e.id }})); }}"""
EIN_INFO = f"""() => {{ const s = {S}; const h = s.state.fahrzeuge[window.__heli]; const e = s.einsatz(h.einsatzId); if (!e) return null;
  const R = 6371, r = (x) => x * Math.PI / 180, a = e.adresse; const dl = r(a.lat - h.lat), dn = r(a.lon - h.lon);
  const km = 2 * R * Math.asin(Math.sqrt(Math.sin(dl / 2) ** 2 + Math.cos(r(h.lat)) * Math.cos(r(a.lat)) * Math.sin(dn / 2) ** 2));
  const t = window.__pilot.handy().neu.tab; return {{ km, stufe: (t.ein || {{}}).stufe, code: e.code }}; }}"""

def efb_seite(b, g, eingebettet=False):
    """EFB gegen das Spiel (/stand, /befehl wie handy.rs); eingebettet: im Rahmen wie im H145-Tablet"""
    html = open(EFB, encoding="utf-8").read(); befehle = []
    ctx = b.new_context(viewport={"width": 1024, "height": 700})
    h = ctx.new_page(); h.on("pageerror", lambda e: logs.append(f"EFB PAGEERROR {e}"))
    rahmen = """<!doctype html><body style="margin:0"><iframe id="f" src="/efb" style="width:1024px;height:700px;border:0"></iframe><script>
      window.__post = []; window.addEventListener('message', (ev) => { const d = ev.data || {}; window.__post.push(d.leitwerk);
        if (d.leitwerk === 'stand') document.getElementById('f').contentWindow.postMessage({ leitwerk: 'missionStand', laeuft: !!window.__laeuft, andere: false }, '*'); });</script></body>"""
    def route(r):
        u = r.request.url
        if "mapsneu" in u or "/schrift/" in u: return r.fulfill(status=404, body="")
        if "/stand" in u:
            d = g.evaluate("() => JSON.parse(JSON.stringify(window.__pilot.handy()))")
            return r.fulfill(status=200, content_type="application/json", body=json.dumps(d))
        if "/befehl" in u:
            cmd = r.request.post_data or ""; befehle.append(cmd)
            if not cmd.startswith("funk_"): g.evaluate("(b) => window.__pilot.handyBefehl(b)", cmd)
            return r.fulfill(status=200, body="ok")
        if eingebettet and u.rstrip("/").endswith("/rahmen"): return r.fulfill(status=200, content_type="text/html", body=rahmen)
        return r.fulfill(status=200, content_type="text/html", body=html)
    h.route("**/*", route)
    h.goto("http://geraet.test/rahmen" if eingebettet else "http://geraet.test/efb"); h.wait_for_timeout(1500)
    return ctx, h, befehle

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema:'dunkel', einfuehrung:true})); })()")
        g = ctx.new_page(); g.on("pageerror", lambda e: logs.append(f"SPIEL PAGEERROR {e}"))
        g.goto("http://localhost:8966/?debug&seed=66"); g.wait_for_timeout(2500)
        print("    Heli", g.evaluate(START)); g.wait_for_timeout(1500)
        heim = g.evaluate(f"() => {{ const h = {S}.state.fahrzeuge[window.__heli]; return {{ lat: h.lat, lon: h.lon }}; }}")

        # ---- Testeinsätze: 5–20 km, nur ALS orange, ALS rot, BLS/ALS aufwertbar
        info = []
        for i in range(4):
            g.evaluate(EINSATZ); g.wait_for_timeout(6500); g.evaluate(ST, "alarmiert"); g.wait_for_timeout(400)
            x = g.evaluate(EIN_INFO)
            if x: info.append(x)
            g.evaluate(FREI); g.wait_for_timeout(200)
            g.evaluate(f"(p) => {{ const h = {S}.state.fahrzeuge[window.__heli]; h.lat = p.lat; h.lon = p.lon; }}", heim)
        print("    Testeinsätze", [(round(x["km"], 1), x["stufe"], x["code"]) for x in info])
        check(len(info) == 4 and all(4.5 <= x["km"] <= 20.5 for x in info), "Testeinsätze 5–20 km vom Hubschrauber")
        check(len(info) == 4 and all(x["stufe"] in ("ALS orange", "ALS rot", "BLS/ALS aufwertbar") for x in info), "Testeinsätze nur ALS orange, ALS rot, BLS/ALS aufwertbar")

        # ---- Tablet: Alarm als kleines Fenster, Minimieren, Status über Funk/PC lässt es verschwinden
        ectx, h, bef = efb_seite(b, g)
        print("    Einsatz", g.evaluate(EINSATZ)); g.wait_for_timeout(6500); h.wait_for_timeout(1500)
        pop = h.evaluate("() => { const a = document.getElementById('alarm'), p = a && a.querySelector('.apop'); if (!p || a.classList.contains('versteckt')) return null; const r = p.getBoundingClientRect(); return { w: r.width, h: r.height, t: p.innerText }; }")
        check(bool(pop) and pop["w"] < 800 and pop["h"] < 600, f"Tablet: Alarm als kleines Fenster ({pop and round(pop['w'])}×{pop and round(pop['h'])})")
        check(bool(pop) and "Minimieren" in pop["t"] and "Quittieren" in pop["t"] and "Zum BO" in pop["t"], "Tablet: Knöpfe Minimieren, 9 Quittieren, Zum BO")
        h.screenshot(path=os.path.join(ARB, "b66-efb-alarm.png"))
        h.click("#alMin"); h.wait_for_timeout(600)
        mini = h.evaluate("() => { const m = document.getElementById('alarmMini'); return m && !m.classList.contains('versteckt') ? m.innerText : ''; }")
        check("ALARM" in mini and h.evaluate("() => document.getElementById('alarm').classList.contains('versteckt')"), f"Tablet: Minimieren → rote Leiste oben ({mini[:40]})")
        h.screenshot(path=os.path.join(ARB, "b66-efb-mini.png"))
        h.click("#alarmMini"); h.wait_for_timeout(600)
        check(h.evaluate("() => !document.getElementById('alarm').classList.contains('versteckt')"), "Tablet: Leiste antippen öffnet das Fenster wieder")
        g.evaluate(ST, "alarmiert"); h.wait_for_timeout(2200)  # wie über Funk/CARLS/PC
        weg = h.evaluate("() => document.getElementById('alarm').classList.contains('versteckt') && document.getElementById('alarmMini').classList.contains('versteckt')")
        check(weg and g.evaluate(STATUS) == "alarmiert", "Tablet: Status 9 über Funk/PC – Alarmfenster verschwindet")
        # zu früh: Status 4 ohne Entscheidung → Meldung auch im Tablet
        g.evaluate(AMORT); g.wait_for_timeout(800)
        g.evaluate("() => window.__pilot.handyBefehl('s4')"); h.wait_for_timeout(1800)
        mel = h.evaluate("() => { const m = document.getElementById('meldung'); return m && !m.classList.contains('versteckt') ? m.textContent : ''; }")
        check(len(mel) > 5 and g.evaluate(STATUS) == "amBO", f"Tablet: Meldung bei zu frühem Status 4 („{mel[:60]}“)")
        h.screenshot(path=os.path.join(ARB, "b66-efb-meldung.png"))
        ectx.close()

        # ---- Karte: Fahrzeuge des Einsatzes blau mit weißem Rand, Name mit Status-Ziffer
        g.evaluate(SCHRITT, 4); g.wait_for_timeout(1500)
        k = g.evaluate("() => window.__pilotKarte ? window.__pilotKarte() : null") or {}
        mit = [x for x in (k.get("fz") or []) if x.get("mit")]
        check(len(mit) >= 1 and all(x["farbe"] == "#2F6FED" for x in mit), f"PC-Karte: Fahrzeuge des Einsatzes blau ({len(mit)})")
        lab = [x.get("lab") or "" for x in mit]
        check(bool(lab) and all(" · " in x and x.split(" · ")[-1] for x in lab), f"PC-Karte: Name mit Status-Ziffer ({', '.join(lab[:3])})")
        tf = [x for x in ((g.evaluate("() => window.__pilot.handy().neu.tab.karte") or {}).get("fz") or []) if x.get("ein")]
        check(bool(tf) and all(x["f"] == "#2F6FED" and x["s"] for x in tf), "Tablet-Karte: Fahrzeuge des Einsatzes blau, mit Status")

        # ---- PC-Fenster zeigt, was das Tablet zeigt
        for i in range(40):
            if any(x["phase"] == "vorOrt" for x in g.evaluate(ANDERE)): break
            g.evaluate(SCHRITT, 2)
        g.wait_for_timeout(1500)
        T = g.evaluate("() => window.__pilot.handy().neu.tab")
        pc = g.evaluate("""() => ({ einh: [...document.querySelectorAll('.pvn-einhk .pvn-eh')].map((x) => x.innerText),
          abf: !!document.querySelector('.pvn-abfk2'), abfZ: document.querySelectorAll('.pvn-abfl > div').length,
          pat: (document.querySelector('.pvn-patk') || {}).innerText || '' })""")
        check(len(pc["einh"]) == len(T.get("fz") or []) and len(pc["einh"]) >= 2, f"PC: Einheiten als Liste wie im Tablet ({len(pc['einh'])})")
        stn = [x["txt"] for x in T["fz"] if not x.get("ich")]
        check(all(any(s.split(" · ")[0] in e for e in pc["einh"]) for s in stn) and any(" · " in s for s in stn), "PC: Einheiten mit Statustext und Wache")
        check(pc["abf"] and pc["abfZ"] == len(T.get("abf") or []), f"PC: Abfrage wie im Tablet ({pc['abfZ']} Zeilen)")
        tp = T.get("pat") or {}
        check(not tp.get("meldung") or "Notruf" in pc["pat"], "PC: Notruf-Meldung beim Patienten")
        pl = (T.get("pat") or {}).get("liste") or []
        fakt = sum(len(x.get("fakt") or []) for x in pl)
        check(fakt == 0 or "Vor Ort festgestellt" in pc["pat"].replace("VOR ORT FESTGESTELLT", "Vor Ort festgestellt"), f"PC: „Vor Ort festgestellt“ ({fakt})")
        g.screenshot(path=os.path.join(ARB, "b66-pc-einsatz.png"))
        # MSFS-Fahrzeuge: welche Modelle wo stehen sollen
        TIT = ["DRK Ambulance parked", "DRK Ambulance emergency lights", "Emergency Doctor Vehicle lights on", "Gurney red", "Police Audi lights", "H145 Rescue Helicopter"]
        ps = g.evaluate("(t) => window.__pilot.propsSoll(t)", TIT)
        print("    Props", ps)
        fzsoll = [x for x in ps["soll"] if x["id"].startswith("fz:")]
        check(ps["rtw"] == "DRK Ambulance emergency lights" and ps["nef"] == "Emergency Doctor Vehicle lights on" and ps["trage"] == "Gurney red", "MSFS-Fahrzeuge: Blaulicht-Varianten gewählt, Hubschrauber nicht")
        check(any(x["id"].startswith("pat:") for x in ps["soll"]) and len(fzsoll) >= 1 and all(x["titel"] in TIT for x in fzsoll), f"MSFS-Fahrzeuge: Trage beim Patienten und Fahrzeuge vor Ort ({len(fzsoll)})")
        def m(a, b): return math.hypot((a["lat"] - b["lat"]) * 111320, (a["lon"] - b["lon"]) * 111320 * math.cos(math.radians(a["lat"])))
        alle_p = ps["soll"]
        check(all(m(alle_p[i], alle_p[j]) >= 8.5 for i in range(len(alle_p)) for j in range(i + 1, len(alle_p))), "MSFS-Fahrzeuge: nicht aufeinander")
        # Navigation auf der PC-Karte (im Flug zum Krankenhaus bzw. Einsatzort)
        kh = g.evaluate("() => { const E = window.__pilot.handy().neu.ent; return E && E.khs && E.khs[0] ? E.khs[0].id : null; }")
        print("    plan", g.evaluate(f"async (k) => {{ try {{ return await {S}.call('pilotPlan', window.__heli, {{ art: 'transport', hospitalId: k }}); }} catch (e) {{ return 'X ' + e.message; }} }}", kh))
        print("    4", g.evaluate(ST, "zumZO")); g.wait_for_timeout(1600)
        nav = g.evaluate("() => { const n = document.querySelector('.pv-knav'); return n ? n.innerText : ''; }")
        check("°" in nav and "km" in nav, f"PC-Karte: Navigation Kurs · km · min · an ({nav.replace(chr(10), ' ')})")
        g.screenshot(path=os.path.join(ARB, "b66-pc-nav.png"))
        # RTW meldet sich kurz nach Status 4 frei (NAH transportiert)
        g.evaluate(SCHRITT, 20)
        a = g.evaluate(ANDERE)
        print("    nach 4 + 5 min (mit Rückweg zu Fuß)", a)
        check(all(not x["mit"] or x["phase"] not in ("vorOrt", "warteKH") for x in a), "RTW: NAH transportiert – RTW nach Status 4 bald frei")
        ps = g.evaluate("(t) => window.__pilot.propsSoll(t)", TIT)
        check(not [x for x in ps["soll"] if x["id"].startswith("fz:")], "MSFS-Fahrzeuge: abgefahrenes Fahrzeug ist weg")
        g.evaluate(FREI); g.wait_for_timeout(500)

        # ---- NA im RTW, NAH fliegt allein: RTW fährt mit Status 4 los
        g.evaluate(f"(p) => {{ const h = {S}.state.fahrzeuge[window.__heli]; h.lat = p.lat; h.lon = p.lon; }}", heim)
        print("    Einsatz", g.evaluate(EINSATZ)); g.wait_for_timeout(5000)
        g.evaluate(ST, "alarmiert"); g.evaluate(AMORT)
        for i in range(60):
            if any(x["phase"] == "vorOrt" and x["typ"] == "RTW" for x in g.evaluate(ANDERE)): break
            g.evaluate(SCHRITT, 2)
        g.evaluate(SCHRITT, 6); g.wait_for_timeout(800)
        kh = g.evaluate("() => { const E = window.__pilot.handy().neu.ent; return E && E.khs && E.khs[0] ? E.khs[0].id : null; }")
        print("    plan", g.evaluate(f"async (k) => {{ try {{ return await {S}.call('pilotPlan', window.__heli, {{ art: 'uebergabe', naMit: true, hospitalId: k }}); }} catch (e) {{ return 'X ' + e.message; }} }}", kh))
        print("    4", g.evaluate(ST, "zumZO"))
        g.evaluate(SCHRITT, 6)
        a = g.evaluate(ANDERE)
        print("    nach 4 + 1,5 min", a)
        check(any(x["mit"] and x["typ"] == "RTW" and x["phase"] == "transport" for x in a), "RTW: NA im RTW – RTW fährt mit Status 4 los")
        fm = g.evaluate(f"() => {{ const s = {S}; const h = s.state.fahrzeuge[window.__heli]; const e = s.einsatz(h.einsatzId); return e ? e.protokoll.map(x => x.text).filter(t => /Notarzt von|Notarzt vom|ohne Notarzt/.test(t)) : []; }}")
        check(any("Notarzt von" in x for x in fm) and not any("ohne Notarzt" in x for x in fm), f"RTW (Beta 67): sagt, dass der Notarzt mitfährt ({fm[:2]})")
        g.evaluate(FREI); g.wait_for_timeout(500)

        # ---- Kein Transport: RTW sofort frei
        g.evaluate(f"(p) => {{ const h = {S}.state.fahrzeuge[window.__heli]; h.lat = p.lat; h.lon = p.lon; }}", heim)
        print("    Einsatz", g.evaluate(EINSATZ)); g.wait_for_timeout(5000)
        g.evaluate(ST, "alarmiert"); g.evaluate(AMORT)
        for i in range(40):
            if any(x["phase"] == "vorOrt" for x in g.evaluate(ANDERE)): break
            g.evaluate(SCHRITT, 2)
        print("    plan", g.evaluate(f"async () => {{ try {{ return await {S}.call('pilotPlan', window.__heli, {{ art: 'kein', grund: 'kein' }}); }} catch (e) {{ return 'X ' + e.message; }} }}"))
        g.evaluate(SCHRITT, 1)
        a = g.evaluate(ANDERE)
        check(all(not x["mit"] for x in a), f"RTW: kein Transport – RTW sofort frei, auf der Anfahrt storniert ({a})")
        g.evaluate(FREI)

        # ---- H145: großes Fenster „Funkgerät & Tablet verbinden“, wenn nicht verbunden
        ectx, h, bef = efb_seite(b, g, eingebettet=True)
        h.wait_for_timeout(4000)
        f = h.frame_locator("#f")
        vp = h.frames[1].evaluate("() => { const v = document.getElementById('verbPop'); return v && !v.classList.contains('versteckt') ? v.innerText : ''; }") if len(h.frames) > 1 else ""
        check("verbinden" in vp.lower() and "Später" in vp, "H145: großes Fenster „Funkgerät & Tablet verbinden“")
        h.screenshot(path=os.path.join(ARB, "b66-efb-verbinden.png"))
        f.locator("#verbJa").click(); h.wait_for_timeout(600)
        check("mission" in h.evaluate("() => window.__post"), "H145: „Verbinden“ startet die Mission")
        zu = h.frames[1].evaluate("() => document.getElementById('verbPop').classList.contains('versteckt')")
        check(zu, "H145: Fenster danach zu")
        ectx.close()
        print("    LOGS", json.dumps(logs[:6], ensure_ascii=False))
        check(not logs, "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
