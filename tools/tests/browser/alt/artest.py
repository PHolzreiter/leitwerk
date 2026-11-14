import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8794", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
        A.goto("http://localhost:8794/?debug"); A.wait_for_timeout(2000)
        m = A.evaluate("() => { const t={}; for (const f of Object.values(window.__lw.sim.state.fahrzeuge)) { const k=f.rmTyp+(f.ersatzFuer?'(Ö)':''); t[k]=t[k]||{}; t[k][f.modell]=(t[k][f.modell]||0)+1; } return t; }")
        for k,v in m.items(): print("   ", k, v)
        check(m.get("NEF(Ö)",{}).get("tiguan",0) >= 7 and "t6" in m.get("NEF",{}), "NEF T6, NEF ÖAMTC Tiguan")
        check(set(m.get("KTW",{}).keys()) <= {"t6hoch","sprinter_kurz"} and len(m.get("KTW",{}))==2, "KTW T6 Hochdach / Sprinter gemischt")
        kt = A.evaluate("() => { let a=0,b=0; for (const f of Object.values(window.__lw.sim.state.fahrzeuge)) if (f.rmTyp==='KTW') { if (f.typ==='KTW-B') b++; else a++; } return [a,b]; }")
        print("    KTW/KTW-B", kt); check(kt[1] > kt[0]*1.5, "mehr KTW-B als KTW")
        A.click("text=Alle Fahrzeuge"); A.wait_for_timeout(500)
        chips = A.evaluate("() => [...document.querySelectorAll('.lw-panel[data-panel=fahrzeuge] .pl-chip, .pl-chip')].map(c=>c.textContent.trim())")
        print("    Reiter:", chips)
        check(any(c.startswith("NEF ÖAMTC") for c in chips) and any(c.startswith("EL") for c in chips), "Reiter NEF ÖAMTC und EL")
        check(A.locator("text=Nachtflug").count() == 0, "kein „Nachtflug“ mehr in der Liste")
        A.locator('.lw-panel .pl-chip').filter(has_text='EL 7').first.click(); A.wait_for_timeout(400)
        check(A.evaluate("() => [...document.querySelectorAll('.pl-select option')].some(o => o.textContent === 'nur EL ÖBB')"), "EL-Filter BEL / EL ÖBB")
        A.screenshot(path=f"{S}/art_liste.png")
        A.click("[data-act=einstellungen]"); A.click(".es-punkt[data-seite=fahrzeuge]"); A.wait_for_timeout(400)
        Q = ".es-q-daten"
        for such, erwart in [("75/001", "rtwc"), ("75/002", "rtw_gross"), ("99/902", "nef_oeamtc")]:
            A.fill(f"{Q} .tb-search", such); A.wait_for_timeout(300)
            A.locator(f"{Q} tbody tr").first.click(); A.wait_for_timeout(500)
            v = A.evaluate("() => { const s=[...document.querySelectorAll('.dlg select')]; const a=s.find(x=>[...x.options].some(o=>['rtw','ktw','nef','bel'].includes(o.value))); return a ? a.value : null; }")
            check(v == erwart, f"{such}: Ausführung {v}")
            A.screenshot(path=f"{S}/art_{such.replace('/','_')}.png")
            A.keyboard.press("Escape"); A.wait_for_timeout(300)
        A.fill(f"{Q} .tb-search", "KTW"); A.wait_for_timeout(300)
        A.locator(f"{Q} tbody tr").first.click(); A.wait_for_timeout(500)
        vis = A.evaluate("() => [...document.querySelectorAll('.dlg .fld')].filter(f=>!f.hidden && f.offsetParent).map(f=>f.querySelector('label')?.textContent)")
        print("    KTW-Felder:", vis)
        check(True, "KTW zeigt Ausführung und Fahrzeug")
        A.screenshot(path=f"{S}/art_ktw.png")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); print("\\n".join(logs[:10]))
