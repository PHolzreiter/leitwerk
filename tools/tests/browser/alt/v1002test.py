import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8795", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(c, m):
    global fails
    print(("OK     " if c else "FEHLER ") + m)
    if not c: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(viewport={"width": 1600, "height": 950}); A.on("pageerror", lambda e: logs.append(str(e)))
        A.goto("http://localhost:8795/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => window.__lw.startseite.zeigen()"); A.wait_for_timeout(3500)
        n0 = A.evaluate("() => { const x = [...document.querySelectorAll('.st-check-p')]; x.forEach(e => e.dataset.alt = '1'); return x.length; }")
        for v in ["normal", "wechselhaft", "echt", "normal"]:
            A.evaluate(f"() => document.querySelector('.st-seg[data-seg=wetter] button[data-v={v}]').click()"); A.wait_for_timeout(250)
        r = A.evaluate("() => { const x = [...document.querySelectorAll('.st-check-p')]; return [x.length, x.filter(e => e.dataset.alt === '1').length, getComputedStyle(x[0]).animationName]; }")
        print("  ", n0, r)
        check(n0 > 0 and r[0] == n0 and r[1] == n0, "Klick auf Wetter: Symbole des Checks bleiben (nicht neu gezeichnet)")
        A.evaluate("() => document.querySelector('.st-check-p').closest('.st-check') && null")
        check(not logs, f"keine Seitenfehler {logs[:2]}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
