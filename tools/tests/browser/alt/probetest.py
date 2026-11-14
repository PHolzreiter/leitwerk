# 0.111: Probe im Alarmton-Dialog hört auf (Stopp, Fertig, Esc)
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8912", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
INIT = """(() => { window.__q = {an:0, aus:0}; const P = AudioBufferSourceNode.prototype; const s = P.start, t = P.stop;
  P.start = function(...a){ window.__q.an++; this.addEventListener('ended', () => {}); return s.apply(this, a); };
  P.stop = function(...a){ if (!this.__aus) { this.__aus = 1; window.__q.aus++; } return t.apply(this, a); }; })()"""
def laeuft(A): return A.evaluate("() => window.__q.an - window.__q.aus")
def oeffnen(A):
    A.locator('[data-act="pilot-einst"]').click(); A.wait_for_timeout(300)
    A.locator(".plt-einst-b", has_text="Alarmtöne").click(); A.wait_for_timeout(600)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); A = b.new_page(viewport={"width": 1600, "height": 1000}); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.add_init_script(INIT)
        A.goto("http://localhost:8912/?debug"); A.wait_for_timeout(2500)
        A.evaluate("() => window.__lw.startseite && window.__lw.startseite.zeigen()"); A.wait_for_timeout(800)
        A.locator('[data-act="pilot"]').first.click(); A.wait_for_timeout(500)
        A.locator(".dlg-foot button", has_text="Testmodus").click(); A.wait_for_timeout(2500)
        A.locator(".plt-wahl-b", has_text="Christophorus 2").first.click(); A.wait_for_timeout(800)
        while A.locator(".dlg").count(): A.keyboard.press("Escape"); A.wait_for_timeout(200)
        oeffnen(A)
        A.locator('[data-p="alarm"]').click(); A.wait_for_timeout(1500)
        check(laeuft(A) == 1, f"Probe läuft ({laeuft(A)})")
        check(A.locator('[data-act="stopp"]').is_enabled(), "Stopp-Knopf aktiv")
        A.locator('[data-act="stopp"]').click(); A.wait_for_timeout(400)
        check(laeuft(A) == 0, "Stopp beendet die Probe")
        # schnell zweimal: nur eine Probe
        A.locator('[data-p="alarm"]').click(); A.locator('[data-p="abruf"]').click(); A.locator('[data-p="alarm"]').click(); A.wait_for_timeout(1500)
        check(laeuft(A) <= 1, f"mehrfach gedrückt: höchstens eine Probe ({laeuft(A)})")
        A.keyboard.press("Escape"); A.wait_for_timeout(600)
        check(laeuft(A) == 0, "Esc schließt und beendet die Probe")
        oeffnen(A)
        A.locator('[data-p="alarm"]').click(); A.wait_for_timeout(1200)
        A.locator(".dlg-foot button", has_text="Fertig").click(); A.wait_for_timeout(500)
        check(laeuft(A) == 0, "Fertig beendet die Probe")
        # neue Töne: Länge
        d = A.evaluate("""async () => { const c = new OfflineAudioContext(1, 44100, 44100); const r = {}; for (const n of ['rdprio01','rdprio01_distant','fwprio01','fwprio02','martinhorn','martinhorn_distant']) { const u = [...document.querySelectorAll('script')].length; } return r; }""")
        b.close()
finally:
    srv.terminate()
print("\n".join(logs[:5])); print("FEHLER:", fails); sys.exit(1 if fails else 0)
