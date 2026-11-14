# v0.67: Mithelfen / Tickets (Ticket-Dienst wird nachgestellt)
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8867", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
zustand = {"online": False, "status": "eingegangen", "version": "", "antwort": "", "nr": 41}
gesendet = []
def dienst(route):
    req = route.request
    if not zustand["online"]:
        return route.abort()
    u = req.url
    if u.endswith("/api/hilfe"):
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"punkte": [
            {"id": "fg-03", "titel": "Fahrzeuge NÖ-03 kontrollieren", "text": "Krems, Tulln", "art": "fahrzeug"},
            {"id": "kh-x", "titel": "Ambulanzzeiten Klinikum X", "text": "", "art": "krankenhaus"},
            {"id": "frei", "titel": "Wie läuft die Übergabe?", "text": "", "art": "vorschlag"}]}))
    if u.endswith("/api/tickets") and req.method == "POST":
        b = json.loads(req.post_data)
        gesendet.append(b)
        if b.get("titel", "").startswith("BOESE"):
            return route.fulfill(status=400, content_type="application/json", body=json.dumps({"fehler": "Test abgelehnt"}))
        zustand["nr"] += 1
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"nr": zustand["nr"], "geheim": "a" * 32, "status": "eingegangen", "erstellt": 1}))
    if u.endswith("/api/status"):
        b = json.loads(req.post_data)
        return route.fulfill(status=200, content_type="application/json", body=json.dumps({"tickets": [{"nr": t["nr"], "status": zustand["status"], "version": zustand["version"], "antwort": zustand["antwort"], "geaendert": 2} for t in b["tickets"] if t["nr"] == 42]}))
    return route.fulfill(status=404, body="")
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1600, "height": 950})
        ctx.route("https://tickets.leitwerk.workers.dev/**", dienst)
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(str(e)))
        A.add_init_script("localStorage.setItem('leitwerk.persoenlich', JSON.stringify({thema: 'dunkel', einfuehrung: true}))")
        A.goto("http://localhost:8867/?debug&start"); A.wait_for_timeout(3500)
        punkte = A.evaluate("() => [...document.querySelectorAll('.st-hilfe-liste li span')].map(x => x.textContent)")
        check(len(punkte) == 7 and "Fahrzeuge NÖ-01 kontrollieren" in punkte and any("Johanniter" in x for x in punkte), f"Startliste ohne Verbindung: {len(punkte)} Punkte")
        A.screenshot(path=f"{S}/v67_start.png")
        # Antwort auf offenen Punkt (ohne Verbindung)
        A.click('[data-hilfe="fg-03"]'); A.wait_for_timeout(600)
        d = A.evaluate("() => ({ kopf: document.querySelector('.mh-kopf')?.textContent ?? '', reiter: document.querySelector('.mh-reiter-b.aktiv')?.dataset.r, opts: [...document.querySelectorAll('.mh datalist option')].map(o => o.value).slice(0, 400) })")
        check("NÖ-03" in d["kopf"] and d["reiter"] == "fahrzeug" and len(d["opts"]) > 50, f"Formular Fahrzeug zum Punkt ({len(d['opts'])} Dienststellen)")
        stelle = next((o for o in d["opts"] if "Rotes Kreuz" in o and "Krems" in o), d["opts"][0])
        A.fill('.mh input[name="dienststelle"]', stelle); A.dispatch_event('.mh input[name="dienststelle"]', "change"); A.wait_for_timeout(200)
        A.fill('.mh input[name="funkrufname"]', "61/598"); A.select_option('.mh select[name="typ"]', "KTW")
        A.fill('.mh textarea[name="text"]', "Fehlt seit 2026 in Krems")
        A.set_input_files('.mh input[name="anhaenge"]', files=[{"name": "boese.exe", "mimeType": "application/octet-stream", "buffer": b"MZ"}]); A.wait_for_timeout(300)
        n0 = A.evaluate("() => document.querySelectorAll('.mh-datei').length")
        A.set_input_files('.mh input[name="anhaenge"]', files=[{"name": "liste.csv", "mimeType": "text/csv", "buffer": "funkruf;typ\n61/598;KTW\n".encode()}]); A.wait_for_timeout(300)
        n1 = A.evaluate("() => document.querySelectorAll('.mh-datei').length")
        A.set_input_files('.mh input[name="anhaenge"]', files=[{"name": "gross.txt", "mimeType": "text/plain", "buffer": b"x" * 2_100_000}]); A.wait_for_timeout(300)
        n2 = A.evaluate("() => document.querySelectorAll('.mh-datei').length")
        check(n0 == 0 and n1 == 1 and n2 == 1, f"Anhänge: .exe und über 2 MB abgelehnt, .csv angenommen ({n0}, {n1}, {n2})")
        A.click('.dlg-foot .btn.primary'); A.wait_for_timeout(800)
        m = A.evaluate("() => ({ reiter: document.querySelector('.mh-reiter-b.aktiv')?.dataset.r, text: document.querySelector('.mh-meine-wrap')?.textContent ?? '', knopf: document.querySelector('[data-act=\"meine-tickets\"]').textContent })")
        check(m["reiter"] == "meine" and "noch nicht gesendet" in m["text"] and "(1)" in m["knopf"], f"ohne Verbindung in der Warteschlange: {m['knopf']}")
        # online: Warteschlange wird geschickt
        zustand["online"] = True
        A.click('.mh-reiter-b[data-r="fahrzeug"]'); A.click('.mh-reiter-b[data-r="meine"]'); A.wait_for_timeout(1200)
        t = A.evaluate("() => document.querySelector('.mh-meine-wrap')?.textContent ?? ''")
        g = gesendet[0] if gesendet else {}
        print("   ", {k: (v if k != "anhaenge" else [a["name"] for a in v]) for k, v in g.items()})
        check("#42" in t and "eingegangen" in t, "Warteschlange geschickt: Ticket #42 eingegangen")
        check(g.get("art") == "fahrzeug" and g.get("hilfeId") == "fg-03" and g.get("daten", {}).get("funkrufname") == "61/598" and g.get("daten", {}).get("was") == "fehlt"
              and [a["name"] for a in g.get("anhaenge", [])] == ["liste.csv"] and "61/598" in g.get("importCsv", "") and g.get("version") and g.get("text") == "Fehlt seit 2026 in Krems", "Ticket-Inhalt vollständig (Daten, Anhang, CSV, Version)")
        # POI mit Koordinaten
        A.click('.mh-reiter-b[data-r="poi"]'); A.wait_for_timeout(500)
        A.fill('.mh input[name="name"]', "Freibad Testdorf"); A.select_option('.mh select[name="kategorie"]', index=3)
        A.fill('.mh input[name="ort-suche"]', "48.2041, 15.6256"); A.press('.mh input[name="ort-suche"]', "Enter"); A.wait_for_timeout(300)
        A.click('.dlg-foot .btn.primary'); A.wait_for_timeout(800)
        g = gesendet[-1]
        check(g.get("art") == "poi" and abs(g["daten"]["lat"] - 48.2041) < 1e-6 and g["daten"]["kategorie"] and "Freibad Testdorf" in g.get("importCsv", ""), f"POI mit Lage geschickt (#{zustand['nr']})")
        # Pflichtfelder
        A.click('.mh-reiter-b[data-r="dienststelle"]'); A.wait_for_timeout(400)
        vor = len(gesendet)
        A.fill('.mh input[name="name"]', "Ortsstelle Ohneort"); A.click('.dlg-foot .btn.primary'); A.wait_for_timeout(400)
        check(len(gesendet) == vor and A.evaluate("() => !!document.querySelector('.mh')"), "Dienststelle ohne Lage wird nicht geschickt")
        # abgelehnt vom Dienst
        A.click('.mh-reiter-b[data-r="vorschlag"]'); A.wait_for_timeout(300)
        A.fill('.mh input[name="titel"]', "BOESE"); A.fill('.mh textarea[name="text"]', "x"); A.click('.dlg-foot .btn.primary'); A.wait_for_timeout(600)
        toastT = A.evaluate("() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')")
        check("Test abgelehnt" in toastT and A.evaluate("() => document.querySelector('.mh-reiter-b.aktiv')?.dataset.r") == "vorschlag", "vom Dienst abgelehntes Ticket: Hinweis, Formular bleibt")
        A.click('.dlg-foot .btn:not(.primary)'); A.wait_for_timeout(300)
        # online: Liste vom Dienst
        A.reload(); A.wait_for_timeout(1500)
        punkte = A.evaluate("() => [...document.querySelectorAll('.st-hilfe-liste li span')].map(x => x.textContent)")
        check(len(punkte) == 3, f"Liste vom Dienst: {punkte}")
        # Stand ändert sich → Hinweis
        zustand.update(status="eingebaut", version="0.67.0", antwort="Danke, ist drin!")
        A.wait_for_timeout(5500)
        toastT = A.evaluate("() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')")
        check("#42" in toastT and "eingebaut in Version 0.67.0" in toastT, f"Hinweis bei neuem Stand: {toastT}")
        neu = A.evaluate("() => document.querySelector('[data-act=\"meine-tickets\"]').classList.contains('neu')")
        A.click('[data-act="meine-tickets"]'); A.wait_for_timeout(800)
        t = A.evaluate("() => document.querySelector('.mh-meine-wrap')?.textContent ?? ''")
        check(neu and "eingebaut in Version 0.67.0" in t and "Danke, ist drin!" in t, "Meine Tickets: Stand, Version und Antwort")
        A.screenshot(path=f"{S}/v67_meine.png")
        # nichts im eigenen Spiel
        n = A.evaluate("() => window.__lw.store.list('pois').some(p => p.name === 'Freibad Testdorf') || window.__lw.store.list('vehicles').some(v => v.funkrufname === '61/598')")
        check(not n, "nichts davon im eigenen Spiel")
        check(not logs, f"keine Fehler im Programm {logs[:3]}")
        b.close()
finally:
    srv.terminate()
print(f"FEHLER: {fails}")
