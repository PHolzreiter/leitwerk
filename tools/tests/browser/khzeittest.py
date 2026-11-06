import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8795", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
        A.goto("http://localhost:8795/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1000)
        A.evaluate("() => { const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; s.state.khBelegung = {}; }")
        def setzeZeit(iso):
            A.evaluate("(iso) => { window.__lw.sim.state.zeit = new Date(iso).getTime(); }", iso)
        def vor(lat, lon, bu, rot=False):
            return A.evaluate("([lat, lon, bu, rot]) => window.__lw.sim.khFuer({lat, lon}, bu, rot).slice(0, 8).map(v => ({ id: v.h.id, n: v.h.kurzname, e: v.eignung, zu: v.zu, voll: v.voll, platz: v.platz, frei: v.frei, ges: v.gesamt }))", [lat, lon, bu, rot])
        GRAZ = (47.07, 15.44); LINZ = (48.30, 14.29); KREMS = (48.41, 15.60)
        # Öffnungszeiten: Elisabethinen Graz Notaufnahme Mo–Fr 07–15
        setzeZeit("2026-10-17T10:00:00")  # Samstag
        r = vor(*GRAZ, "bu_exsikkose_synkope_az_verschlechterung")
        eli = [x for x in r if x["id"] == "kh068"]
        print("    Graz Sa:", [(x["n"], x["e"], "zu" if x["zu"] else "offen") for x in r[:5]])
        check(eli and eli[0]["zu"], "Elisabethinen Graz am Samstag zu")
        setzeZeit("2026-10-20T10:00:00")  # Dienstag
        r = vor(*GRAZ, "bu_exsikkose_synkope_az_verschlechterung")
        eli = [x for x in r if x["id"] == "kh068"]
        check(eli and not eli[0]["zu"], "Elisabethinen Graz am Dienstag 10 Uhr offen")
        # Linzer Aufnahmerad: 2026-09-01 = BHS-Tag (S), 2026-09-04 = KUK-Tag (K)
        setzeZeit("2026-09-01T10:00:00")
        r = vor(*LINZ, "bu_exsikkose_synkope_az_verschlechterung")
        st = {x["id"]: x["zu"] for x in r}
        print("    Linz 1.9.:", [(x["n"], "zu" if x["zu"] else "offen") for x in r[:6]])
        check(st.get("kh048") is False and st.get("kh037") is True, "Linz 1.9.: BHS nimmt auf, Kepler nicht")
        setzeZeit("2026-09-04T10:00:00")
        r = vor(*LINZ, "bu_exsikkose_synkope_az_verschlechterung")
        st = {x["id"]: x["zu"] for x in r}
        check(st.get("kh037") is False and st.get("kh048") is True, "Linz 4.9.: Kepler nimmt auf, BHS nicht")
        setzeZeit("2026-09-04T06:30:00")  # vor dem Wechsel um 7 Uhr: noch der Vortag (K? Tag 2 = S)
        r = vor(*LINZ, "bu_exsikkose_synkope_az_verschlechterung")
        st = {x["id"]: x["zu"] for x in r}
        check(st.get("kh048") is False, "Wechsel erst um 7 Uhr")
        # Plätze: Schockraum Krems (1) belegen
        setzeZeit("2026-10-20T10:00:00")
        r = vor(*KREMS, "bu_polytrauma", True)
        print("    Polytrauma Krems:", r[:3])
        A.evaluate("() => { const s = window.__lw.sim; s.state.khBelegung = { kh002: { schockraum: [{ bis: s.state.zeit + 3600000, einsatz: '' }] } }; }")
        r2 = vor(*KREMS, "bu_polytrauma", True)
        kr = [x for x in r2 if x["id"] == "kh002"]
        print("    belegt:", r2[:3])
        check(kr and kr[0]["voll"], "Schockraum Krems belegt → voll")
        best = A.evaluate("() => window.__lw.sim.naechstesKh({lat: 48.41, lon: 15.60}, 'bu_polytrauma', true)?.id")
        check(best != "kh002", f"Besatzung wählt ein anderes Haus ({best})")
        # Grundbelegung: Tageskurve
        A.evaluate("() => { const s = window.__lw.sim; s.state.khBelegung = {}; s.state.khGrundZeit = undefined; }")
        def belegung(start, stunden):
            return A.evaluate("""([start, h]) => { const s = window.__lw.sim; s.state.khBelegung = {}; s.state.khGrundZeit = undefined; let t = new Date(start).getTime();
                for (let i = 0; i < h * 60; i++) { t += 60000; s.state.zeit = t; s['khTick'](t); }
                let na = 0, krit = 0; for (const proKh of Object.values(s.state.khBelegung)) { for (const [r, l] of Object.entries(proKh)) { const n = l.filter(x => x.bis > t).length; if (r === 'notaufnahme') na += n; if (/schockraum|herzkatheter|ecmo|druckkammer/.test(r)) krit += n; } } return [na, krit]; }""", [start, stunden])
        tag = belegung("2026-10-20T06:00:00", 5)
        nacht = belegung("2026-10-20T23:00:00", 4)
        print("    Notaufnahme belegt 11 Uhr / 3 Uhr:", tag, nacht)
        check(tag[0] > nacht[0] * 2, "vormittags deutlich mehr belegt als nachts")
        check(tag[1] <= max(3, tag[0] * 0.05), "Schockraum/PCI selten von selbst belegt")
        A.evaluate("() => { window.__lw.sim.settings.khGrundAktiv = false; }")
        aus = belegung("2026-10-20T06:00:00", 5)
        check(aus[0] == 0, "Grundbelegung ausschaltbar")
        A.evaluate("() => { window.__lw.sim.settings.khGrundAktiv = true; }")
        # Fenster KH-Status
        setzeZeit("2026-10-20T10:00:00")
        A.evaluate("() => window.__lw.zeige('khstatus')"); A.wait_for_timeout(1500)
        n = A.locator(".khs-z[data-kh]").count()
        check(n >= 8, f"KH-Status zeigt Häuser ({n})")
        A.screenshot(path=f"{S}/kh_status.png")
        A.locator(".khs-z[data-kh]").first.click(); A.wait_for_timeout(500)
        check(A.locator(".khd-plaetze .khd-platz").count() >= 2, "Mehr-Info-Fenster zeigt Plätze")
        check(A.locator(".dlg .khd").inner_text().find("http") < 0, "keine Quellen im Spiel")
        A.screenshot(path=f"{S}/kh_detail.png")
        A.keyboard.press("Escape")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:10]))
