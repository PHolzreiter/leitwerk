import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8790", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1700, "height": 1000})
        ctx.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A = ctx.new_page()
        A.on("pageerror", lambda e: print("PAGEERROR", e))
        A.goto("http://localhost:8790/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => document.querySelectorAll('.map-message').forEach(e => e.hidden = true)")
        def gruppe(pid):
            return A.evaluate(f"() => window.__lw.dock.getPanel('{pid}')?.group?.id")
        ids = A.evaluate("() => window.__lw.dock.panels.map(p => p.id + '@' + p.group.id)")
        print(ids)
        for pid in ["telefon", "karte", "funk"]:
            tab = A.locator(f'.dv-tab[data-tab-panel-id={pid}]').first
            if tab.count() == 0: print("kein Reiter", pid); continue
            vor = gruppe(pid)
            # Ziel: Mitte eines anderen Panels
            ziel = A.evaluate(f"() => {{ const g = window.__lw.dock.groups.find(g => g.id !== '{vor}'); const r = g.element.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2, g.id]; }}")
            tab.drag_to(A.locator("body"), target_position={"x": ziel[0], "y": ziel[1]})
            A.wait_for_timeout(600)
            print(pid, vor, "->", gruppe(pid), "(Ziel", ziel[2], ")")
        A.screenshot(path=f"{S}/tabtest.png")
finally:
    srv.terminate()
