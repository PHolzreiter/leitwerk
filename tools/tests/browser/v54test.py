# v0.54: Bewusstsein und Atmung vor dem Grundproblem, Kreislaufstillstand sofort erkennbar
import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8840", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        A = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
        A.add_init_script("(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
        A.add_init_script("try { localStorage.setItem('lw.abfrageAnsicht','klassisch') } catch (e) {}")
        A.goto("http://localhost:8840/?debug"); A.wait_for_timeout(1500)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); window.__lw.kiPrefsSetzen({ aktiv: false }); }")
        A.click(".lw-panel[data-panel=einsatzliste] >> text=+ Test"); A.click(".ctx-menu.test >> text=Notfall"); A.wait_for_timeout(1200)
        A.click(".tel-row:is(.st-klingelt, .st-verpasst) .btn.primary"); A.wait_for_timeout(1500)
        titel = A.locator(".lw-panel[data-panel=abfrage] .abfrage-titel").all_text_contents()
        check(titel[:4] == ["1 · Einsatzort", "2 · Rückrufnummer", "3 · Bewusstsein und Atmung", "4 · Was ist passiert?"], f"Reihenfolge: Bewusstsein und Atmung vor dem Grundproblem ({titel})")
        check(A.locator(".abfrage .frage:has-text('wach und ansprechbar')").count() == 1 and A.locator(".abfrage .frage:has-text('Atmet der Patient normal')").count() == 1, "Bewusstsein und Atmung schon vor der Kapitelwahl fragbar")
        A.locator(".abfrage .frage:has-text('wach und ansprechbar') .opt").nth(2).click(); A.wait_for_timeout(600)
        A.locator(".abfrage .frage:has-text('Atmet der Patient normal') .opt").nth(3).click(); A.wait_for_timeout(900)
        rea = A.locator(".lw-panel[data-panel=abfrage] .abfrage .reanimation")
        check(rea.count() == 1 and "Kreislaufstillstand" in rea.inner_text(), "Bewusstlos + keine Atmung: Kreislaufstillstand-Hinweis sofort")
        rea.locator("button").click(); A.wait_for_timeout(1200)
        titel = A.locator(".lw-panel[data-panel=abfrage] .abfrage-titel").all_text_contents()
        kap = A.inner_text(".lw-panel[data-panel=abfrage] .kapitel-chip")
        code = A.inner_text(".lw-panel[data-panel=abfrage] .code-zeile") if A.locator(".lw-panel[data-panel=abfrage] .code-zeile").count() else A.inner_text(".lw-panel[data-panel=abfrage]")
        check(kap.strip().startswith("9") and "Reanimation anleiten" in A.inner_text(".lw-panel[data-panel=abfrage]"), f"Knopf wählt das Stillstand-Kapitel, Code mit Reanimation ({kap.strip()[:40]})")
        n = A.locator(".abfrage .frage:has-text('wach und ansprechbar')").count()
        check(n == 1 and "5 · Primärabfrage" in titel, f"Primärabfrage ohne doppelte Fragen ({titel})")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:20]))
