# Beta 74 (Paul 22./23.11.2026): Discord-Aktivität „Spielt LeitWerk“ – Hauptmenü, Lobby, Spiel (Disponent/Pilot),
# Details abschaltbar, nie Einsatzinhalte; Einstellung unter Mein Platz › Bedienung › Discord (Standard an).
# Die echte Verbindung zu Discord gibt es nur im Programm – hier werden Texte, Zustand und Einstellung geprüft.
# Aufruf: python3 beta74test.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8974", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1500, "height": 950})
        A = ctx.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}"))
        A.goto("http://localhost:8974/?debug&seed=8974"); A.wait_for_timeout(2500)
        A.evaluate("() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); delete p.discord; delete p.discordDetails; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch {} }")
        bau = lambda lage: A.evaluate("(l) => window.__lw.discord.aktivitaet(l)", lage)
        L = dict(ort="spiel", pilot=False, details=True, gruppe="RD-NOE-03", rufname="", pilotStatus="", offen=3, spieltyp="Standard", pause=False, host=False, spieler=0, mehrspieler=False, start=1000)

        # 1) Texte je Zustand
        a = bau({**L, "ort": "menue"})
        check(a["details"] == "Im Hauptmenü" and not a["state"] and a["gross_text"].startswith("LeitWerk"), f"Hauptmenü: {a['details']}")
        a = bau({**L, "ort": "lobby", "host": True, "mehrspieler": True, "spieler": 2})
        check(a["details"] == "In der Lobby" and a["state"] == "Wartet auf Mitspieler" and a["runde"] == [2, 6], f"Lobby (Host): {a['details']} / {a['state']} {a['runde']}")
        a = bau({**L, "ort": "lobby", "host": False, "mehrspieler": True, "spieler": 3})
        check(a["state"] == "Wartet auf den Start", f"Lobby (Mitspieler): {a['state']}")
        a = bau(L)
        check(a["details"] == "Disponent · RD-NOE-03" and a["state"] == "3 offene Einsätze · Standard" and a["runde"] is None and a["start"] == 1000, f"Disponent: {a['details']} / {a['state']}")
        a = bau({**L, "offen": 1, "mehrspieler": True, "spieler": 4})
        check(a["state"] == "1 offener Einsatz · Standard" and a["runde"] == [4, 6], f"Einzahl + Mitspieler: {a['state']} {a['runde']}")
        a = bau({**L, "pause": True})
        check(a["state"] == "Pausiert", "Pause")
        a = bau({**L, "pilot": True, "rufname": "Heli Nord 2", "pilotStatus": "Frei auf Wache"})
        check(a["details"] == "Pilot · Heli Nord 2" and a["state"] == "Frei auf Wache", f"Pilot: {a['details']} / {a['state']}")
        a = bau({**L, "details": False})
        check(a["details"] == "Im Spiel" and a["state"] is None and a["runde"] is None, "ohne Details: nur „Im Spiel“")

        # 2) Zustand aus dem laufenden Spiel: keine Einsatzinhalte
        r = A.evaluate("""async () => { const L = window.__lw, s = L.sim; s.settings.generatorAktiv = false; const h = L.hauptmenue; if (h.offen()) h.schliessen(); await new Promise(r => setTimeout(r, 400));
            const e = await s.generiereFall(); s.anrufAnnehmen(e.id); s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse } });
            const lage = L.discord.lage(); const a = L.discord.aktivitaet(lage);
            return { lage, a, adr: e.wahr.adresse, code: e.wahr.code }; }""")
        print("    ", r["lage"]["ort"], r["a"])
        js = json.dumps(r["a"], ensure_ascii=False)
        a0 = bau({**L, "offen": 0})
        check(a0["state"] == "Keine offenen Einsätze · Standard" and a0["klein"] == "rd", f"keine Einsätze: {a0['state']} (Bild {a0['klein']})")
        a0 = bau({**L, "pilot": True, "rufname": "Heli Nord 2", "pilotStatus": "Frei auf Wache"})
        check(a0["klein"] == "heli" and a0["klein_text"] == "Pilot", "Pilot: kleines Bild Hubschrauber")
        check(r["lage"]["ort"] == "spiel" and r["lage"]["gruppe"].startswith("RD-NOE-") and r["lage"]["offen"] >= 1, f"im Spiel: Funkgruppe {r['lage']['gruppe']}, {r['lage']['offen']} offen")
        strasse = r["adr"].split(",")[0]
        check(strasse not in js and r["code"] not in js, "keine Adresse und kein Code in der Aktivität")

        # 3) Einstellung: Mein Platz › Bedienung › Discord
        A.evaluate("() => window.__lw.hauptmenue.zeigen(undefined, { splash: false, seite: 'einstellungen' })"); A.wait_for_timeout(1500)
        txt = lambda: A.evaluate("() => document.querySelector('.hm-wurzel').innerText")
        A.click(".l-tab:has-text('Mein Platz')"); A.wait_for_timeout(800)
        A.click(".l-spage:has-text('Bedienung')"); A.wait_for_timeout(800)
        t = txt()
        check("Spielt LeitWerk" in t and "Einstellen" in t, "Bedienung: Abschnitt Discord")
        lage = A.evaluate("() => window.__lw.discord.lage()")
        check(lage["ort"] == "menue", f"im Hauptmenü erkannt ({lage['ort']})")
        jetzt = A.evaluate("() => Date.now()")
        check(lage["start"] and jetzt - lage["start"] < 15000, f"Zeit im Hauptmenü zählt ab dem Hauptmenü ({(jetzt - lage['start']) / 1000:.0f} s)")
        A.click(".l-srow:has-text('in Discord') button:has-text('Einstellen')"); A.wait_for_timeout(1000)
        t = txt()
        check("In Discord zeigen, dass ich LeitWerk spiele" in t and "Details zeigen" in t and "Nur im installierten Programm" in t and "Aktivitätsprivatsphäre" in t, "Discord-Seite: zwei Schalter, Verbindung, Tipp")
        an = A.evaluate("() => { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); return [p.discord, p.discordDetails]; }")
        check(an == [None, None], "Standard: an (nichts gespeichert)")
        A.click(".l-srow:has-text('Details zeigen') .l-tog, .l-srow:has-text('Details zeigen') input"); A.wait_for_timeout(600)
        d = A.evaluate("() => window.__lw.discord.lage().details")
        check(d is False, "Details abschaltbar")
        A.click(".l-srow:has-text('Details zeigen') .l-tog, .l-srow:has-text('Details zeigen') input"); A.wait_for_timeout(400)
        for l in logs[:5]: print("    ", l)
        check(not logs, "keine Seitenfehler")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails)
