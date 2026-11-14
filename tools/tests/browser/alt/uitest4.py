import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
dist, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8767", "-d", dist], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
logs = []
def code_and_addr(pg, code):
    pg.click("[data-act=gen]")
    pg.wait_for_timeout(800)
    pg.fill(".mask .addr input >> nth=0", code)
    pg.wait_for_timeout(400)
    pg.click(".mask .addr-list:not([hidden]) .addr-item >> nth=0")
    pg.wait_for_timeout(300)
    adr = pg.locator(".mask .addr input").nth(1)
    adr.fill("Krems")
    pg.wait_for_timeout(700)
    pg.click(".mask .addr-list:not([hidden]) .addr-item >> nth=0")
    pg.wait_for_timeout(1500)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1600, "height": 950})
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}") if m.type in ("error",) and "404" not in m.text and "GL Driver" not in m.text and "glyph" not in m.text else None)
        pg.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        pg.goto("http://localhost:8767/")
        pg.wait_for_timeout(2500)
        for i, code in enumerate(["RD-4A3A", "RD-1C1", "RD-2D0", "RD-2E0"]):
            code_and_addr(pg, code)
            why = pg.locator(".sugg-why").all_inner_texts()
            rec = pg.locator(".sugg-row.rec").all_inner_texts()
            print(code, "|", why, "|", [r.replace("\n"," ") for r in rec])
            pg.screenshot(path=f"{out}/mask_{code}.png")
        pg.click(".veh-row >> nth=3", button="right")
        pg.wait_for_timeout(300)
        pg.click("text=Besetzung ändern")
        pg.wait_for_timeout(400)
        pg.screenshot(path=f"{out}/crew_dialog.png")
        pg.click(".dlg-foot >> text=Abbrechen")
        pg.click(".tab[data-view=settings]")
        pg.wait_for_timeout(800)
        pg.screenshot(path=f"{out}/settings.png", full_page=True)
        b.close()
finally:
    srv.terminate()
print("\n".join(logs[:40]))
