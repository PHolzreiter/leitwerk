# Handy-Seite: Tastenfeld (halten), Seiten wischen, Alarm → Einsatz, Buchen
import subprocess, sys, time, json, threading, queue
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]; HTML = sys.argv[3]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8921", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
stand = {"json": "{}"}; befehle = queue.Queue()
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith("/stand"):
            b = stand["json"].encode(); self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)
        else:
            b = open(HTML, "rb").read(); self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); befehle.put(self.rfile.read(n).decode()); self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
hs = ThreadingHTTPServer(("127.0.0.1", 8922), H); threading.Thread(target=hs.serve_forever, daemon=True).start()
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_page(viewport={"width": 1500, "height": 950}); A.on("pageerror", lambda e: logs.append(f"A {e}"))
        A.goto("http://localhost:8921/?debug"); A.wait_for_timeout(2500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(800)
        A.evaluate("() => window.__lw.startseite && window.__lw.startseite.zeigen()"); A.wait_for_timeout(800)
        A.locator('[data-act="pilot"]').first.click(); A.wait_for_timeout(500)
        A.locator(".dlg-foot button", has_text="Testmodus").click(); A.wait_for_timeout(2500)
        if A.locator(".plt-wahl-b").count(): A.locator(".plt-wahl-b", has_text="Christophorus 2").first.click(); A.wait_for_timeout(800)
        while A.locator(".dlg").count(): A.keyboard.press("Escape"); A.wait_for_timeout(200)
        A.evaluate("() => { const s = window.__lw.sim; s.state.wetter.lage = 'klar'; s.state.wetter.wind = 10; const f = Object.values(s.state.fahrzeuge).find(x => x.pilot); f.flugAbgemeldet = false; s.setStatus(f, 'freiWache'); s.emit(); }")
        ctx = b.new_context(viewport={"width": 768, "height": 1024}, device_scale_factor=1)
        B = ctx.new_page(); B.on("pageerror", lambda e: logs.append(f"B {e}"))
        def bruecke(ms=1200):
            ende = time.time() + ms / 1000
            while time.time() < ende:
                while not befehle.empty():
                    c = befehle.get(); A.evaluate("(c) => window.__pilot.handyBefehl(c)", c)
                stand["json"] = json.dumps(A.evaluate("() => window.__pilot.handy()"))
                B.wait_for_timeout(120)
        bruecke(200)
        A.locator('[data-act="test"]').click(); A.wait_for_timeout(400)
        A.locator(".plt-testmenue .plt-wahl-k").first.click(); A.wait_for_function("() => Object.values(window.__lw.sim.state.fahrzeuge).some(x => x.pilot && x.einsatzId)", timeout=30000)
        bruecke(6000)
        for name, vp in [("hoch", {"width": 768, "height": 1024}), ("quer", {"width": 1024, "height": 700})]:
            B.set_viewport_size(vp); B.goto("http://127.0.0.1:8922/efb"); bruecke(2500)
            q = B.evaluate("() => document.body.className")
            check((q == "quer") == (name == "quer"), f"EFB {name}: Aufbau passt ({q!r})")
            check(B.locator(".st").count() == 7 and "ALARM" in B.inner_text("#alarm"), f"EFB {name}: Status und Alarm")
            check(B.locator("#alarm .code").count() == 1, f"EFB {name}: Code im Alarm")
            B.screenshot(path=f"{S}/efb_{name}.png")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate(); hs.shutdown()
print("FEHLER gesamt:", fails)
