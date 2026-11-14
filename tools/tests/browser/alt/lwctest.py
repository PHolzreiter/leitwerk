import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8791", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails=0; logs=[]
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails+=1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.add_init_script("(() => { localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true})); const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()")
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8791/?debug"); A.wait_for_timeout(2500)
        r = A.evaluate("() => { const s=window.__lw.store; return [s.schemaIstStandard, s.schema && s.schema.name, s.list('codes').length]; }")
        print("   ", r); check(r[0] and r[1] == "LeitWerk-Codesystem" and r[2] > 500, "LeitWerk-Codesystem ist Standard")
        e = A.evaluate("async () => { const s=window.__lw.sim; const out=[]; for (let i=0;i<25;i++){ const e=await s.generiere(); if(e) out.push([e.wahr.code, e.wahr.abfrage?.kapitel, e.wahr.abfrage?.szenario?.vorlage ?? '-', e.wahr.abfrage?.anrufer?.rolle?.slice(0,30), e.stufe]); } return out; }")
        for x in e: print("   ", x)
        check(len(e) >= 15, "Einsätze mit LeitWerk-Codesystem")
        check(sum(1 for x in e if x[2] != '-') >= 8, "Fallgeschichten passen")
        # Anruf annehmen und abfragen
        A.locator(".tel-row.st-klingelt .btn.primary").first.click(); A.wait_for_timeout(2000)
        A.screenshot(path=f"{S}/lwc_abfrage.png")
        txt = A.inner_text(".lw-panel[data-panel=abfrage]")
        print("   ", txt[:400].replace("\n", " | "))
        check("Hauptbeschwerde" in txt or "Kapitel" in txt or "Sturz" in txt, "Abfrage-Fenster zeigt das Codesystem")
        A.click("[data-act=einstellungen]"); A.click(".es-punkt[data-seite=codes]"); A.wait_for_timeout(500)
        A.screenshot(path=f"{S}/lwc_codes.png")
        check(A.locator(".schema-bar >> text=LeitWerk-Codesystem (mitgeliefert)").count() == 1, "Einstellungen zeigen das mitgelieferte Codesystem")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\n".join(logs[:10]))
