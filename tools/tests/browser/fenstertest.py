import subprocess, sys, time
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8795", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1400, "height": 900})
        ctx.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'hell', einfuehrung: true}))")
        A = ctx.new_page(); A.on("pageerror", lambda e: print("A PAGEERROR", e))
        A.goto("http://localhost:8795/?debug"); A.wait_for_timeout(3000)
        B = ctx.new_page(); B.on("pageerror", lambda e: print("B PAGEERROR", e)); B.on("console", lambda m: print("B", m.text) if "rror" in m.text else None)
        B.goto("http://localhost:8795/?debug&fenster=fenster-2"); B.wait_for_timeout(3000)
        print("A:", A.evaluate("() => window.__lw.dock.panels.map(p=>p.id)"))
        print("B:", B.evaluate("() => window.__lw.dock?.panels.map(p=>p.id)"))
        r = B.evaluate("""() => {
          const ziel = document.querySelector('.dv-dockview') ;
          const grp = window.__lw.dock.groups[0];
          const el = grp ? grp.element.querySelector('.dv-content-container') || grp.element : document.querySelector('#dock');
          const rect = el.getBoundingClientRect();
          const dt = new DataTransfer(); dt.setData('application/x-leitwerk-reiter', JSON.stringify({id: 'telefon', von: 'haupt'}));
          const opt = {bubbles: true, cancelable: true, dataTransfer: dt, clientX: rect.x + rect.width/2, clientY: rect.y + rect.height/2};
          el.dispatchEvent(new DragEvent('dragenter', opt));
          el.dispatchEvent(new DragEvent('dragover', opt));
          el.dispatchEvent(new DragEvent('drop', opt));
          return [!!grp, el.className];
        }""")
        print("drop:", r); B.wait_for_timeout(800)
        print("B nach:", B.evaluate("() => window.__lw.dock.panels.map(p=>p.id)"))
        print("A nach:", A.evaluate("() => window.__lw.dock.panels.map(p=>p.id)"))
finally:
    srv.terminate()
