# Hochkant-Bildschirm 9:16: Vorlage „hoch“ – jedes Fenster in 9:8 (Full HD 1080 × 960, WQHD 1440 × 1280)
# Aufruf: python3 hochtest.py <arbeitsordner> <web-build> [bilder-ordner]
import subprocess, sys, time
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]; BILD = sys.argv[3] if len(sys.argv) > 3 else None
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8935", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
J = "window.__lw.sim"
UEBERLAUF = """(g) => { const el = document.querySelectorAll('.dv-groupview')[g]; if (!el) return ['keine Gruppe'];
  const r = el.getBoundingClientRect(); const out = [];
  for (const x of el.querySelectorAll('.dv-content-container *')) { const b = x.getBoundingClientRect(); if (!b.width || !b.height) continue;
    const st = getComputedStyle(x); if (st.position === 'fixed' || st.visibility === 'hidden') continue;
    if (b.right > r.right + 2 && !x.closest('[style*="overflow"], .dv-scrollable')) out.push((x.className && x.className.baseVal === undefined ? x.className : x.tagName) + ' ' + Math.round(b.right - r.right) + 'px'); }
  return [...new Set(out)].slice(0, 6); }"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for (bw, bh, name) in [(1080, 1920, "fhd"), (1440, 2560, "wqhd")]:
            ctx = b.new_context(viewport={"width": bw, "height": bh})
            ctx.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
            A = ctx.new_page(); logs = []
            A.on("pageerror", lambda e: logs.append(str(e)))
            A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
            A.goto("http://localhost:8935/?debug"); A.wait_for_timeout(2500)
            A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
            A.evaluate("async () => { const L = window.__lw; await L.vorlage(L.dock && 0); }")
            idx = A.evaluate("() => ['ein','zwei','breit','hoch'].indexOf('hoch')")
            A.evaluate("async () => { const L = window.__lw; const i = 3; await L.vorlage(i); }"); A.wait_for_timeout(1200)
            gr = A.evaluate("() => [...document.querySelectorAll('.dv-groupview')].map(g => { const r = g.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })")
            print("   ", name, "Gruppen:", gr)
            check(len(gr) == 2 and all(abs(w / h - 9 / 8) < 0.12 for w, h in gr), f"{name}: zwei Fenster je ca. 9:8 {gr}")
            # Inhalte: Einsatz, KT, SEK, Anruf
            A.evaluate(f"""async () => {{ const s={J}; const d=new Date(s.state.zeit); d.setHours(10,0,0,0); s.state.zeit=d.getTime(); s.call('start');
                const e = await s.generiere('kritisch'); s.anrufAnnehmen(e.id); s.anrufBeenden(e.id); s.aktualisiere(e.id, {{ adresse: {{ lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse }} }});
                const k = await s.generiereKt('online'); const q = await s.generiereSek('hotline'); s.ktAnrufAnnehmen(q.id);
                const L = window.__lw; L.sel.waehle('einsatz', e.id); L.sel.waehle('kt', k.id); L.sel.waehle('kt', q.id); L.sel.waehle('einsatz', e.id); }}""")
            A.wait_for_timeout(1500)
            for g in range(2):
                ids = A.evaluate("(g) => [...document.querySelectorAll('.dv-groupview')[g].querySelectorAll('.dv-tab')].map(t => t.getAttribute('data-tab-panel-id'))", g)
                for i, pid in enumerate(ids):
                    titel = A.evaluate("(id) => { const p = window.__lw.dock.getPanel(id); p.api.setActive(); return p.title; }", pid); A.wait_for_timeout(900)
                    ue = A.evaluate(UEBERLAUF, g)
                    check(not ue, f"{name} {titel}: nichts ragt aus dem Fenster {ue}")
                    if BILD: A.locator(".dv-groupview").nth(g).screenshot(path=f"{BILD}/{name}_{g}_{i}_{titel.replace(' ', '_').replace('/', '_')}.png")
            print("\n".join(logs[:5])); check(not logs, f"{name}: keine Fehler auf der Seite")
            ctx.close()
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); sys.exit(1 if fails else 0)
