import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
dist, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "-d", dist], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
logs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
        pg.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        pg.goto("http://localhost:8765/")
        pg.wait_for_timeout(2500)
        pg.screenshot(path=f"{out}/1_map.png")
        pg.click("button.tab[data-view=data]")
        pg.wait_for_timeout(500)
        pg.screenshot(path=f"{out}/2_data_stations.png")
        pg.click(".nav-item:has-text(\"Fahrzeuge\")")
        pg.wait_for_timeout(300)
        pg.screenshot(path=f"{out}/3_data_vehicles.png")
        pg.click(".nav-item:has-text(\"Krankenhäuser\")")
        pg.wait_for_timeout(300)
        pg.screenshot(path=f"{out}/4_data_hosp.png")
        # Import Pauls Fahrzeugliste
        pg.click(".nav-item:has-text(\"Dienststellen\")")
        with pg.expect_file_chooser() as fc:
            pg.click("button[data-act=import]")
        fc.value.set_files(sys.argv[3])
        pg.wait_for_timeout(500)
        pg.screenshot(path=f"{out}/5_import.png")
        pg.click(".dlg-foot >> text=Importieren")
        pg.wait_for_timeout(500)
        pg.screenshot(path=f"{out}/6_after_import.png")
        # Edit dialog
        pg.click(".data-table tbody tr >> nth=0")
        pg.wait_for_timeout(300)
        pg.screenshot(path=f"{out}/7_edit.png")
        b.close()
finally:
    srv.terminate()
print("\n".join(logs[:60]))
