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
        ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
        B = ctx.new_page(); B.on("pageerror", lambda e: logs.append(f"B {e}"))
        def bruecke(ms=1200):
            ende = time.time() + ms / 1000
            while time.time() < ende:
                while not befehle.empty():
                    c = befehle.get(); A.evaluate("(c) => window.__pilot.handyBefehl(c)", c)
                stand["json"] = json.dumps(A.evaluate("() => window.__pilot.handy()"))
                B.wait_for_timeout(120)
        bruecke(200)
        B.goto("http://127.0.0.1:8922/?t=x"); bruecke(1500)
        n = B.locator(".taste").count()
        check(n == 12 and B.locator(".taste.st").count() == 7, f"Tastenfeld 3×4 mit 7 Statustasten ({n})")
        check("Frei Wache" in B.inner_text("#lcd"), "Display zeigt den Status")
        B.screenshot(path=f"{S}/handy_funk.png")
        def status(): return A.evaluate("() => Object.values(window.__lw.sim.state.fahrzeuge).find(x => x.pilot).status")
        k6 = B.locator(".taste", has_text="6").first.bounding_box()
        B.mouse.move(k6["x"] + 20, k6["y"] + 20); B.mouse.down(); bruecke(700); B.mouse.up(); bruecke(1500)
        check(status() == "freiWache", "Taste 6 kurz: nichts")
        B.mouse.down(); bruecke(2400); B.mouse.up(); bruecke(1200)
        check(status() == "freiFunk", f"Taste 6 gehalten: Status 6 ({status()})")
        # Wischen: Seite 2
        B.evaluate("() => document.getElementById('seiten').scrollTo({left: document.getElementById('seiten').clientWidth})"); B.wait_for_timeout(600)
        check(B.locator('#tabs button.an').inner_text().startswith("Einsatz"), "Wischen: Leiste zeigt „Einsatz“")
        B.locator('#tabs button[data-s="0"]').click(); B.wait_for_timeout(700)
        # Alarm → Einsatz
        A.locator('[data-act="test"]').click(); A.wait_for_timeout(400)
        A.locator(".plt-testmenue .plt-wahl-k").first.click(); A.wait_for_function("() => Object.values(window.__lw.sim.state.fahrzeuge).some(x => x.pilot && x.einsatzId)", timeout=30000)
        bruecke(1000)
        vor = B.evaluate("() => document.getElementById('einsatz').innerText")
        check("Kein Einsatz" in vor, "erst „Einsatz rein“, die Alarmierung kommt 2–5 s später")
        bruecke(5500)
        pos = B.evaluate("() => Math.round(document.getElementById('seiten').scrollLeft / document.getElementById('seiten').clientWidth)")
        txt = B.inner_text("#einsatz")
        check(pos == 1, f"Alarm: Handy springt auf „Einsatz“ ({pos})")
        code = A.evaluate("() => { const s = window.__lw.sim; const f = Object.values(s.state.fahrzeuge).find(x => x.pilot); return s.einsatz(f.einsatzId).code; }")
        check(code and code in txt, f"Einsatz zeigt den Code ({code})")
        check("ALARM" in B.inner_text("#lcd"), "Display: ALARM")
        B.screenshot(path=f"{S}/handy_einsatz.png")
        # Code oben am PC
        check(A.locator(".plt-alarm-code").count() == 1 and A.locator(".plt-einsatz .plt-code").count() == 1, "PC: Code im Alarmbalken und beim Einsatz")
        # Notrufabfrage im Einsatzverlauf (PC) und am Handy
        A.evaluate("() => { const s = window.__lw.sim; const f = Object.values(s.state.fahrzeuge).find(x => x.pilot); const e = s.einsatz(f.einsatzId); s.log(e, '*** Erstaufnahme: 05.11.2026_18:00:00 ***\\nHauptbeschwerde: 9 Herzstillstand\\n1.Patient atmet nicht'); s.emit(); }")
        bruecke(1500)
        check(A.locator(".plt-ev-abfrage").count() == 1 and "Notrufabfrage" in A.inner_text(".plt-ev-abfrage summary"), "PC: Notrufabfrage im Einsatzverlauf (aufklappbar)")
        check(B.locator("details.abfrage").count() == 1, "Handy: Notrufabfrage beim Einsatz")
        # Alarmtöne: Einstellungen
        A.locator('[data-act="pilot-einst"]').click(); A.wait_for_timeout(300)
        A.locator(".plt-einst-b", has_text="Alarmtöne").click(); A.wait_for_timeout(600)
        no = A.locator('.plt-alarmdlg select[data-a="alarm"] option').count()
        check(no >= 9 and A.locator('.plt-alarmdlg select[data-a="abruf"]').count() == 1, f"Alarmtöne: Auswahl für Alarm und Abruf ({no} Töne)")
        A.screenshot(path=f"{S}/alarmdlg.png")
        A.locator('.plt-alarmdlg select[data-a="alarm"]').select_option("vorlage:pager"); A.wait_for_timeout(300)
        check(A.evaluate("() => JSON.parse(localStorage.getItem('leitwerk.pilot.alarmtoene')).alarm") == "vorlage:pager", "Auswahl wird gemerkt")
        while A.locator(".dlg").count(): A.keyboard.press("Escape"); A.wait_for_timeout(200)
        # am Berufungsort: Buchen
        A.evaluate("() => { const s = window.__lw.sim; const f = Object.values(s.state.fahrzeuge).find(x => x.pilot); s.setStatus(f, 'amBO'); f.phase = 'vorOrt'; s.emit(); }")
        bruecke(800)
        B.locator('#tabs button[data-s="2"]').click(); bruecke(900)
        B.locator('[data-seite="nah"]').click(); bruecke(900)
        if B.locator(".chip [data-symweg]").count(): B.locator(".chip [data-symweg]").click(); bruecke(900)
        B.locator(".such").fill("Schlag"); bruecke(1500)
        nt = B.locator("[data-sym]").count()
        check(nt > 0, f"Stichwort-Suche am Handy ({nt} Treffer)")
        B.locator("[data-sym]").first.click(); bruecke(1200)
        nk = B.locator("[data-kh]").count()
        check(nk > 0, f"Krankenhäuser als Karten ({nk})")
        B.screenshot(path=f"{S}/handy_buchen.png", full_page=False)
        B.locator("[data-kh]").first.click(); B.wait_for_timeout(300)
        check(not B.locator("#blatt").is_hidden(), "Bestätigen vor dem Buchen")
        B.locator("#blatt-ja").click(); bruecke(1500)
        pl = A.evaluate("() => { const f = Object.values(window.__lw.sim.state.fahrzeuge).find(x => x.pilot); return f.pilot.plan; }")
        print("   ", pl)
        check(pl and pl.get("art") == "transport" and pl.get("hospitalId"), "Buchung vom Handy übernommen")
        check(B.locator(".plan").count() >= 1, "Handy zeigt die Buchung")
        ov = B.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1")
        check(not ov, "keine waagrechte Seite außer dem Wischen")
        check(not logs, f"keine Seitenfehler {logs[:3]}")
        b.close()
finally:
    srv.terminate(); hs.shutdown()
print("FEHLER gesamt:", fails)
