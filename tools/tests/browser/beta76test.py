# Beta 76 (Paul 23.11.2026): Discord – Knopf „Mitspielen“ (Host stellt ein: nur mit Raumcode / auch über Discord),
# Beitreten-Seite des Relays öffnet leitwerk://beitreten/<Code>, Link im Programm → Beitreten mit dem Code;
# Disponent „Telefoniert · …“, Pilot „Pilot · NAH · Funkgruppe“ + Status.
# Mit echtem Relay (lokal über wrangler) wie mpfunktest.
# Aufruf: python3 beta76test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json, os, tempfile, signal, urllib.request
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
HIER = os.path.dirname(os.path.abspath(__file__))
RELAY = os.path.normpath(os.path.join(HIER, "..", "..", "..", "relay"))
PORT_WEB, PORT_RELAY = 8976, 8796
fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1

tmp = tempfile.mkdtemp(prefix="lw-relay-")
log = open(os.path.join(tmp, "wrangler.log"), "w")
relay = subprocess.Popen(["npx", "--yes", "wrangler@3", "dev", "--port", str(PORT_RELAY), "--local", "--persist-to", tmp], cwd=RELAY, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
web = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT_WEB), "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
bis = time.time() + 180
while time.time() < bis and "Ready on" not in open(os.path.join(tmp, "wrangler.log")).read():
    time.sleep(1)
time.sleep(2)
INIT = f"""(() => {{ try {{
  localStorage.setItem('leitwerk.relayUrl', 'ws://127.0.0.1:{PORT_RELAY}');
  const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{{}}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p));
}} catch (e) {{}} }})()"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        def neu(name):
            ctx = b.new_context(viewport={"width": 1500, "height": 950})
            ctx.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
            pg = ctx.new_page(); pg.on("pageerror", lambda e: logs.append(f"{name}: {e}"))
            pg.add_init_script(INIT)
            pg.goto(f"http://localhost:{PORT_WEB}/?debug"); pg.wait_for_timeout(2500)
            pg.evaluate("() => { window.__lw.kiPrefsSetzen({ aktiv: false }); }")
            return pg
        H = neu("Host"); G = neu("Gast")
        bau = lambda lage: H.evaluate("(l) => window.__lw.discord.aktivitaet(l)", lage)
        L = dict(ort="spiel", pilot=False, details=True, gruppe="RD-NOE-03", rufname="", pilotStatus="", offen=3, spieltyp="Standard", pause=False, host=True, spieler=2, mehrspieler=True, start=1000, telefoniert=False, code="123456", beitrittDiscord=False)

        # 1) Texte
        a = bau({**L, "telefoniert": True})
        check(a["state"] == "Telefoniert · 3 offene Einsätze", f"Disponent telefoniert: {a['state']}")
        a = bau({**L, "pilot": True, "rufname": "Heli Nord 2", "pilotStatus": "Zum Berufungsort"})
        check(a["details"] == "Pilot · Heli Nord 2 · RD-NOE-03" and a["state"] == "Zum Berufungsort", f"Pilot: {a['details']} / {a['state']}")
        check(bau(L)["knoepfe"] == [], "kein Knopf bei „Nur mit Raumcode“")
        a = bau({**L, "beitrittDiscord": True})
        check(a["knoepfe"] == [{"text": "Mitspielen", "link": "https://server.leitwerk.workers.dev/beitreten/123456"}], f"Knopf „Mitspielen“: {a['knoepfe']}")
        check(bau({**L, "beitrittDiscord": True, "spieler": 6})["knoepfe"] == [], "kein Knopf, wenn die Runde voll ist")
        check(bau({**L, "beitrittDiscord": True, "ort": "lobby"})["knoepfe"] != [], "Knopf auch in der Lobby")
        check(bau({**L, "beitrittDiscord": True, "mehrspieler": False})["knoepfe"] == [], "kein Knopf im Solo-Spiel")

        # 2) Host: Lobby mit „Wer darf beitreten?“
        code = H.evaluate("async () => { const c = await window.__lw.mp.hosten('Paul'); window.__lw.sim.lobbySetzen(true); return c; }")
        H.evaluate("() => window.__lw.hauptmenue.zeigen(undefined, { splash: false })"); H.wait_for_timeout(1500)
        H.click("button.l-nav:has-text('Spiel starten')"); H.wait_for_timeout(900)
        H.click("button.l-seg:has-text('Multiplayer')"); H.wait_for_timeout(900)
        t = H.evaluate("() => document.querySelector('.hm-wurzel').innerText")
        check("Wer darf beitreten?" in t and "Nur mit Raumcode" in t and "Auch über Discord" in t, "Lobby: „Wer darf beitreten?“")
        check(H.evaluate("() => !!window.__lw.store.settings.beitrittDiscord") is False, "Standard: nur mit Raumcode")
        H.click("button.l-seg:has-text('Auch über Discord')"); H.wait_for_timeout(700)
        r = H.evaluate("() => { const l = window.__lw.discord.lage(); return { an: !!window.__lw.store.settings.beitrittDiscord, l, a: window.__lw.discord.aktivitaet(l) }; }")
        print("    ", r["l"]["ort"], r["a"]["details"], r["a"]["knoepfe"])
        check(r["an"] and r["l"]["ort"] == "lobby" and r["a"]["knoepfe"] and r["a"]["knoepfe"][0]["link"].endswith("/" + code), f"Auch über Discord: Knopf mit dem Lobby-Code {code}")
        check("Code im Link sichtbar" in H.evaluate("() => document.querySelector('.hm-wurzel').innerText"), "Hinweis: Code im Link sichtbar")

        # 3) Beitreten-Seite des Relays
        html = urllib.request.urlopen(f"http://127.0.0.1:{PORT_RELAY}/beitreten/{code}").read().decode()
        check(f"leitwerk://beitreten/{code}" in html and f"{code[:3]} {code[3:]}" in html, "Relay: Beitreten-Seite mit Link und Code")

        # 4) Gast: Link kommt an → Beitreten mit dem Code
        G.evaluate("() => window.__lw.hauptmenue.zeigen(undefined, { splash: false })"); G.wait_for_timeout(1500)
        G.evaluate("(c) => window.__lw.discord.link(c)", code); G.wait_for_timeout(1500)
        t0 = G.evaluate("() => document.querySelector('.hm-wurzel').innerText")
        check("Bitte einen Namen eingeben" in t0 and G.evaluate("() => document.activeElement && document.activeElement.id") == "l-name", "ohne Namen: Code steht schon drin, Namensfeld bereit")
        G.fill("#l-name", "Anna"); G.press("#l-name", "Enter"); G.wait_for_timeout(4000)
        r = G.evaluate("() => ({ rolle: window.__lw.mp.status.rolle, code: window.__lw.mp.status.code, t: document.querySelector('.hm-wurzel').innerText })")
        check(r["rolle"] == "client" and r["code"] == code, f"Gast ist per Link in der Runde ({r['rolle']}, {r['code']})")
        check("Lobby beitreten" in r["t"] or "Warte auf den Host" in r["t"] or "Paul" in r["t"], "Gast sieht die Runde (Host Paul) zum Bestätigen")
        G.wait_for_timeout(1500)
        r = G.evaluate("() => { const l = window.__lw.discord.lage(); return { an: !!window.__lw.store.settings.beitrittDiscord, a: window.__lw.discord.aktivitaet(l) }; }")
        check(r["an"] and r["a"]["knoepfe"], "Einstellung des Hosts kommt beim Gast an – Knopf auch bei ihm")

        # 5) Link während eines Spiels (Hauptmenü zu): Hinweis, dann im Hauptmenü vorbelegt
        X = neu("Spiel")
        X.evaluate("() => { const h = window.__lw.hauptmenue; if (h.offen()) h.schliessen(); }"); X.wait_for_timeout(500)
        X.evaluate("() => window.__lw.discord.link('987654')"); X.wait_for_timeout(600)
        toast = X.evaluate("() => document.body.innerText")
        check("987 654" in toast and "Hauptmenü" in toast, "im Spiel: Hinweis zum Beitreten")
        X.evaluate("() => window.__lw.hauptmenue.zeigen(undefined, { splash: false })"); X.wait_for_timeout(2500)
        t = X.evaluate("() => document.querySelector('.hm-wurzel').innerText")
        ziffern = "".join(ch for ch in t if ch.isdigit())
        check(("Kein Spiel mit diesem Code" in t or "Bitte einen Namen eingeben" in t) and "987654" in ziffern, "danach im Hauptmenü: Beitreten mit dem Code vorbelegt")

        for l in logs[:5]: print("    ", l)
        check(not logs, "keine Seitenfehler")
        b.close()
finally:
    web.terminate()
    try: os.killpg(relay.pid, signal.SIGTERM)
    except Exception: pass
print("FEHLER:", fails)
