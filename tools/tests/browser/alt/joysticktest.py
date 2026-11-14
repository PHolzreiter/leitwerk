# Joystick-Tasten werden wie Tastatur-Tasten weitergegeben (code „Joy:<Gerät>#<Taste>“) – damit lassen sich alle
# Belegungen (Funktaste, Spracheingabe, Kürzel, Pilot) auch auf Joystick/HOTAS legen.
# Aufruf: python3 joysticktest.py <arbeitsordner> <web-build>
import subprocess, sys, time
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8933", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page()
        A.add_init_script("""window.__pad = { id: 'Test HOTAS (Vendor: 1234)', buttons: Array.from({length: 12}, () => ({ pressed: false, value: 0 })), connected: true, index: 0, axes: [] };
          navigator.getGamepads = () => [window.__pad];""")
        A.goto("http://localhost:8933/?debug"); A.wait_for_timeout(2500)
        r = A.evaluate("""async () => { const got = []; window.addEventListener('keydown', (e) => got.push('down ' + e.code), true); window.addEventListener('keyup', (e) => got.push('up ' + e.code), true);
          window.__pad.buttons[3].pressed = true; await new Promise((r) => setTimeout(r, 150)); window.__pad.buttons[3].pressed = false; await new Promise((r) => setTimeout(r, 150)); return got; }""")
        check(r == ["down Joy:Test HOTAS (Vendor: 1234)#3", "up Joy:Test HOTAS (Vendor: 1234)#3"], f"Taste 4 → keydown/keyup {r}")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); sys.exit(1 if fails else 0)
