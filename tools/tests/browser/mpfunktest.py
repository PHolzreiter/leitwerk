# Mehrspieler-Funk mit echtem Relay (lokal über wrangler): Host-Disponent, Gast-Disponent und ein Pilot in drei Browsern.
# Prüft, was bei jedem ankommt: Sprüche, KI-Stimme (gestreamt vom Gesprächsführer), Kanal-Sperre, Vorrang des Piloten,
# wer führt, Storno an den Piloten, Storno-Knopf, Rollenwechsel Disponent → Pilot.
# Aufruf: python3 mpfunktest.py <arbeitsordner> <web-build>
import subprocess, sys, time, json, os, tempfile, re, signal
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
HIER = os.path.dirname(os.path.abspath(__file__))
RELAY = os.path.normpath(os.path.join(HIER, "..", "..", "..", "relay"))
PORT_WEB, PORT_RELAY = 8938, 8791
fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w, flush=True); fails += 0 if ok else 1

# ---- Relay lokal starten (wie in der Anleitung: wrangler dev) ----
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

# Helfer in jedem Browser: Funk-Nachrichten mitschreiben, künstliche Stimme (statt Piper), Warten
HILFE = r"""
window.T = {
  s: () => window.__lw.sim,
  schlaf: (ms) => new Promise((r) => setTimeout(r, ms)),
  async warte(f, ms = 15000) { const bis = Date.now() + ms; while (Date.now() < bis) { try { const x = f(); if (x) return x; } catch (e) {} await T.schlaf(100); } return null; },
  funk: [],
  g: (id) => (T.s().state.funkGespraeche || []).find((g) => g.id === id),
  sprueche: (g) => (g ? g.sprueche.map((x) => `${x.von}: ${x.text}`) : []),
  offen: () => (T.s().state.funkGespraeche || []).filter((g) => g.status !== 'ende'),
  // Audio-Stücke einer Stimme (ki = KI-Fahrzeug) von wem empfangen
  stimme: (von) => T.funk.filter((m) => m.k === 'a' && m.ki && m.v === von).length,
  angekuendigt: () => T.funk.filter((m) => m.k === 'v').length,
};
window.__lw.mp.onFunk((pid, name, d) => T.funk.push({ pid, name, k: d.k, v: d.v, ki: d.ki, g: d.g }));
window.__lw.testStimme.audio = (von, text) => { const n = 16000 * 0.8; const pcm = new Float32Array(n); for (let i = 0; i < n; i++) pcm[i] = 0.25 * Math.sin(i / 7); return { rate: 16000, pcm }; };
"""

def neu(b, name):
    ctx = b.new_context(viewport={"width": 1400, "height": 900})
    ctx.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
    pg = ctx.new_page(); pg.fehler = []
    pg.on("pageerror", lambda e: pg.fehler.append(f"{name}: {e}"))
    pg.on("console", lambda m: pg.fehler.append(f"{name} console: {m.text[:200]}") if m.type == "error" and "Funk" in m.text else None)
    pg.add_init_script(INIT)
    pg.goto(f"http://localhost:{PORT_WEB}/?debug"); pg.wait_for_timeout(2500)
    pg.evaluate(HILFE)
    pg.evaluate("() => { window.__lw.kiPrefsSetzen({ aktiv: false }); }")
    return pg

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        H = neu(b, "Host"); G = neu(b, "Gast"); P = neu(b, "Pilot")
        H.evaluate("async () => { await window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json()); }")
        H.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; window.__lw.store.setSettings(st); }")
        code = H.evaluate("async () => { const c = await window.__lw.mp.hosten('Paul'); const s = T.s(); const d = new Date(s.state.zeit); d.setHours(10, 0, 0, 0); s.state.zeit = d.getTime(); s.lobbySetzen(false); s.funkFestNach = 600; s.settings.rate = 0; s.call('start'); s.call('setTempo', 1); return c; }")
        check(bool(re.fullmatch(r"\d{6}", code or "")), f"Host über das lokale Relay, Code {code}")
        for pg, n in [(G, "Anna"), (P, "Tobi")]:
            pg.evaluate("async ([c, n]) => { await window.__lw.mp.beitreten(c, n); }", [code, n])
        ok = all(pg.evaluate("() => T.warte(() => T.s().mode === 'client' && Object.keys(T.s().state.fahrzeuge).length > 100, 20000)") for pg in (G, P))
        pids = {n: pg.evaluate("() => window.__lw.mp.ich.pid") for pg, n in [(H, "H"), (G, "G"), (P, "P")]}
        spieler = H.evaluate("() => T.warte(() => window.__lw.mp.spiegelDaten().spieler.filter((x) => x.online !== false).length >= 3 && window.__lw.mp.spiegelDaten().spieler.length)")
        check(ok and spieler, f"Gast und Pilot verbunden, Zustand gespiegelt ({spieler} Spieler)")

        # Einsatz beim Host: RTW + Hubschrauber, den der Pilot übernimmt
        x = H.evaluate("""async () => { const s = T.s();
            const e = await s.generiere('kritisch'); s.anrufAnnehmen(e.id); s.anrufBeenden(e.id);
            s.aktualisiere(e.id, { adresse: { lat: e.wahr.lat, lon: e.wahr.lon, label: e.wahr.adresse } });
            const fz = Object.values(s.state.fahrzeuge).filter((f) => f.phase === 'frei' && !f.pilot && !f.funkrufname.startsWith('77/8'));
            const nah = (f) => Math.hypot(f.lat - e.wahr.lat, f.lon - e.wahr.lon);
            const rtws = fz.filter((f) => f.kategorie === 'RTW').sort((a, b) => nah(a) - nah(b));
            // Hubschrauber, die gerade fliegen dürfen (Wetter, Tageszeit); sonst irgendeiner (der Funk-Ablauf ist derselbe)
            let helis = fz.filter((f) => f.kategorie === 'NAH' && !s.flugHindernis(f)).sort((a, b) => nah(a) - nah(b));
            if (helis.length < 2) helis = Object.values(s.state.fahrzeuge).filter((f) => f.kategorie === 'NAH' && !f.pilot).sort((a, b) => nah(a) - nah(b));
            return { e: e.id, rtw: rtws[0].id, rtw2: rtws[1].id, heli: helis[0].id, heli2: helis[1].id, rtwName: s.rufname(rtws[0]), rtw2Name: s.rufname(rtws[1]), heliName: s.rufname(helis[0]), heli2Name: s.rufname(helis[1]) }; }""")
        print("   ", json.dumps(x, ensure_ascii=False))
        r = P.evaluate("async (x) => { await T.s().call('pilotUebernehmen', x.heli); return T.warte(() => T.s().state.fahrzeuge[x.heli].pilot?.pid === window.__lw.mp.ich.pid); }", x)
        check(bool(r), f"Pilot Tobi fliegt {x['heliName']}")
        H.evaluate("(x) => T.s().alarmiere(x.e, [x.rtw, x.heli])", x)
        r = P.evaluate("(x) => T.warte(() => T.s().state.fahrzeuge[x.heli].einsatzId === x.e)", x)
        check(bool(r), "Alarm kommt beim Piloten an")

        # 1) KI-RTW funkt LEO: alle sehen den Spruch und hören die Stimme (gestreamt vom Host)
        gid = H.evaluate("async (x) => { const s = T.s(); await T.warte(() => !s.funkKanalSpricht(null), 20000); const vor = Math.max(0, ...(s.state.funkGespraeche||[]).map((g) => g.id)); s.fzRuft(s.state.fahrzeuge[x.rtw], s.einsatz(x.e), 'info', 'sind auf Anfahrt, kommen'); const g = await T.warte(() => (s.state.funkGespraeche||[]).filter((g) => g.id > vor).find((g) => g.fzId === x.rtw && g.sprueche.length)); return g && g.id; }", x)
        check(gid is not None, f"RTW {x['rtwName']} ruft LEO (Gespräch {gid})")
        for pg, n in [(G, "Gast"), (P, "Pilot")]:
            sp = pg.evaluate("(id) => T.warte(() => T.sprueche(T.g(id)).length && T.sprueche(T.g(id)))", gid)
            st = pg.evaluate("(von) => T.warte(() => T.stimme(von) > 3 && T.stimme(von), 8000)", x["rtwName"])
            check(bool(sp) and bool(st), f"{n} sieht den Ruf ({sp and sp[0]}) und hört die RTW-Stimme ({st} Stücke vom Host)")

        # 2) Wer zuerst antwortet, führt: der Gast antwortet, danach der Host
        G.evaluate("async () => { const s = T.s(); await T.warte(() => !s.state.funkSendet, 10000); await s.call('funkMensch', true, 'leo', undefined, 'g1'); await s.call('funkMensch', false, 'leo', undefined, 'g1'); }")
        G.evaluate("(x) => T.s().call('funkMenschText', null, `${x.rtwName} von LEO, kommen`)", x)
        f = H.evaluate("(id) => T.warte(() => T.g(id)?.fuehrer?.name)", gid)
        check(f == "Anna", f"Gast Anna führt das Gespräch ({f})")
        r = H.evaluate("async (id) => { await T.schlaf(4000); const g = T.g(id); return [g.fuehrer?.name, T.sprueche(g)]; }", gid)
        print("   ", r[1])
        check(r[0] == "Anna" and len(r[1]) >= 2, f"Gespräch bleibt bei Anna, RTW antwortet ({r[1][-1] if r[1] else ''})")
        st = H.evaluate("(von) => T.warte(() => T.stimme(von), 8000)", x["rtwName"])
        check(bool(st), f"Die RTW-Antwort spricht jetzt Annas Rechner – der Host hört sie ({st} Stücke)")
        G.evaluate("(x) => T.s().call('funkMenschText', null, 'verstanden, Ende')", x)
        H.evaluate("(id) => T.warte(() => T.g(id)?.status === 'ende' || !T.g(id), 15000)", gid)

        # 3) Pilot sendet: Kanal belegt – kein KI-Ruf, Disponent muss warten
        r = P.evaluate("async () => { const s = T.s(); await T.warte(() => !s.state.funkSendet && !s.funkKanalSpricht(null), 20000); return s.call('funkMensch', true, 'leo', undefined, 'p1'); }")
        check(bool(r) and not r.get("wartet"), f"Pilot bekommt den Kanal ({r})")
        r = H.evaluate("""async (x) => { const s = T.s(); await T.warte(() => s.state.funkSendet?.name === 'Tobi', 5000);
            const vor = Math.max(0, ...(s.state.funkGespraeche||[]).map((g) => g.id)); s.fzRuft(s.state.fahrzeuge[x.rtw2], s.einsatz(x.e), 'info', 'Status, kommen');
            await T.schlaf(3000); const neu = (s.state.funkGespraeche||[]).filter((g) => g.fzId === x.rtw2 && g.sprueche.length); return [s.state.funkSendet?.name, neu.length, neu.map((g) => [g.funkname, g.kanal, g.status, T.sprueche(g)])]; }""", x)
        check(r[0] == "Tobi" and r[1] == 0, f"Solange der Pilot sendet, ruft kein KI-Fahrzeug ({r})")
        r = G.evaluate("async () => { try { return await T.s().call('funkMensch', true, 'leo', undefined, 'g2'); } catch (e) { return String(e.message || e); } }")
        check(isinstance(r, dict) and r.get("wartet"), f"Disponent Anna wartet, bis der Pilot fertig ist ({r})")
        P.evaluate("async (x) => { const s = T.s(); await s.call('funkMensch', false, 'leo', undefined, 'p1'); await s.call('funkMenschText', null, `LEO von ${x.heliName}, kommen`); }", x)
        g2 = H.evaluate("(x) => T.warte(() => (T.s().state.funkGespraeche||[]).find((g) => g.mensch && g.fzId === x.heli && g.status !== 'ende' && g.sprueche.some((sp) => sp.von === x.heliName)))", x)
        check(bool(g2), "Ruf des Piloten kommt als eigenes Gespräch an")
        # Anna war in der Warteschlange: nach dem Piloten ist sie dran und antwortet ihm – das muss beim Piloten landen
        r = G.evaluate("async (x) => { const s = T.s(); await T.warte(() => s.state.funkSendet?.name === 'Anna', 8000); await s.call('funkMensch', false, 'leo', undefined, 'g2'); await s.call('funkMenschText', null, `${x.heliName} von LEO, kommen`); return true; }", x)
        r = H.evaluate("""(x) => T.warte(() => { const g = (T.s().state.funkGespraeche||[]).find((g) => g.mensch && g.fzId === x.heli && g.status !== 'ende');
            return g && g.sprueche.some((sp) => sp.von === 'LEO') && [T.sprueche(g), g.fuehrer?.name]; }, 8000)""", x)
        check(bool(r) and r[1] == "Anna", f"Annas Antwort landet beim Piloten, nicht beim RTW ({r})")
        alle = H.evaluate("(x) => (T.s().state.funkGespraeche||[]).filter((g) => g.fzId === x.rtw2 && g.sprueche.some((sp) => sp.von === 'LEO')).length", x)
        check(alle == 0, "der zweite RTW bekommt Annas Antwort nicht")
        P.evaluate("(x) => T.s().call('funkMenschText', null, 'verstanden, Ende')", x)
        G.evaluate("(x) => T.s().call('funkMenschText', null, `${x.heliName} von LEO, verstanden, Ende`)", x)

        # 4) Notarzt-Storno an den Piloten: der RTW ruft ihn, die KI spricht nie für ihn
        H.evaluate("async (x) => { const s = T.s(); await T.warte(() => !s.state.funkSendet && !s.funkKanalSpricht(null), 20000); s.naStornoFunk(s.einsatz(x.e), s.state.fahrzeuge[x.rtw], s.state.fahrzeuge[x.heli]); }", x)
        r = P.evaluate("(x) => T.warte(() => { const g = (T.s().state.funkGespraeche||[]).find((g) => g.mensch && g.fzId === x.heli && g.an && g.status !== 'ende'); return g && g.sprueche.length && T.sprueche(g); }, 20000)", x)
        check(bool(r) and x["rtwName"] in r[0], f"Pilot sieht den Ruf des RTW ({r and r[0]})")
        st = P.evaluate("(von) => T.warte(() => T.stimme(von) > 0 && T.stimme(von), 8000)", x["rtwName"])
        check(bool(st), f"Pilot hört den RTW ({st} Stücke)")
        noch = H.evaluate("(x) => T.s().state.fahrzeuge[x.heli].einsatzId === x.e", x)
        check(noch, "kein Storno, bevor der Pilot antwortet")
        P.evaluate("async (x) => { const s = T.s(); await T.warte(() => !s.state.funkSendet, 10000); await s.call('funkMensch', true, 'rtw', undefined, 'p3'); await s.call('funkMensch', false, 'rtw', undefined, 'p3'); await s.call('funkMenschText', null, `Hier ${x.heliName}, kommen`); }", x)
        r = P.evaluate("(x) => T.warte(() => T.s().state.fahrzeuge[x.heli].einsatzId !== x.e, 25000)", x)
        sp = H.evaluate("(x) => { const g = (T.s().state.funkGespraeche||[]).filter((g) => g.mensch && g.fzId === x.heli && g.an).pop(); return T.sprueche(g); }", x)
        print("   ", sp)
        check(bool(r), "nach der Antwort ist der Hubschrauber storniert – auch beim Piloten")
        P.evaluate("async (x) => { const s = T.s(); await T.warte(() => !s.state.funkSendet, 10000); await s.call('funkMensch', true, 'rtw', undefined, 'p4'); await s.call('funkMensch', false, 'rtw', undefined, 'p4'); await s.call('funkMenschText', null, 'Storno verstanden, Ende'); }", x)
        r = H.evaluate("(x) => T.warte(() => !(T.s().state.funkGespraeche||[]).some((g) => g.mensch && g.fzId === x.heli && g.status !== 'ende'), 10000)", x)
        check(bool(r), "Pilot quittiert den Storno – das Gespräch ist zu")
        ki = H.evaluate("(x) => (T.s().state.funkGespraeche||[]).flatMap((g) => g.sprueche).filter((sp) => sp.von === x.heliName && !sp.stimme).length", x)
        check(ki == 0, f"kein Spruch im Namen des Piloten ohne ihn ({ki})")

        # 5) Storno-Knopf des Gast-Disponenten: Fahrzeug frei, kein Funk (wie Diensthandy)
        r = G.evaluate("""async (x) => { const s = T.s(); const vor = (s.state.funkGespraeche||[]).filter((g) => g.fzId === x.rtw2 && g.status !== 'ende').length;
            await s.call('alarmiere', x.e, [x.rtw2]); await T.warte(() => s.state.fahrzeuge[x.rtw2].einsatzId === x.e, 5000);
            await s.call('storno', x.rtw2); await T.schlaf(2500);
            return [s.state.fahrzeuge[x.rtw2].einsatzId, (s.state.funkGespraeche||[]).filter((g) => g.fzId === x.rtw2 && g.status !== 'ende').length - vor]; }""", x)
        check(r[0] is None and r[1] <= 0, f"Storno-Knopf vom Gast: frei, kein Funkspruch ({r})")

        # 6) Rollenwechsel: Anna führt ein Gespräch, trennt sich und kommt als Pilotin zurück
        gid3 = H.evaluate("async (x) => { const s = T.s(); await T.warte(() => !s.state.funkSendet && !s.funkKanalSpricht(null), 20000); const vor = Math.max(0, ...(s.state.funkGespraeche||[]).map((g) => g.id)); s.fzRuft(s.state.fahrzeuge[x.rtw], s.einsatz(x.e), 'info', 'kurze Rückfrage, kommen'); const g = await T.warte(() => (s.state.funkGespraeche||[]).filter((g) => g.id > vor).find((g) => g.fzId === x.rtw && g.sprueche.length)); return g && g.id; }", x)
        G.evaluate("async (x) => { const s = T.s(); await T.warte(() => !s.state.funkSendet, 10000); await s.call('funkMensch', true, 'leo', undefined, 'g3'); await s.call('funkMensch', false, 'leo', undefined, 'g3'); await s.call('funkMenschText', null, `${x.rtwName} von LEO, kommen`); }", x)
        f = H.evaluate("(id) => T.warte(() => T.g(id)?.fuehrer?.name, 8000)", gid3)
        check(f == "Anna", f"vor dem Wechsel führt Anna ({f})")
        G.evaluate("() => window.__lw.mp.verlassen()"); G.wait_for_timeout(1500)
        G.evaluate("async ([c]) => { await window.__lw.mp.beitreten(c, 'Anna'); await T.warte(() => T.s().mode === 'client' && Object.keys(T.s().state.fahrzeuge).length > 100, 20000); }", [code])
        r = G.evaluate("async (x) => { try { await T.s().call('pilotUebernehmen', x.heli2); return 'ok'; } catch (e) { return String(e.message || e); } }", x)
        check(r == "ok", f"Anna fliegt jetzt {x['heli2Name']} ({r})")
        f = H.evaluate("(id) => T.warte(() => { const g = T.g(id); return g && g.fuehrer?.name !== 'Anna' && (g.fuehrer?.name || 'niemand'); }, 8000)", gid3)
        check(f and f != "Anna", f"Annas Gespräch führt jetzt ein Disponent ({f})")
        r = H.evaluate("(x) => { const s = T.s(); const f = s.funkErzeuger(s.einsatz(x.e)); return [f && f.name, s.disponentenOnline().map((b) => b.name)]; }", x)
        check(r[0] == "Paul" and r[1] == ["Paul"], f"Funk der Fahrzeuge formuliert nur noch Paul ({r})")
        # Funk läuft danach sauber weiter: neuer Ruf, Stimme kommt bei beiden Piloten an, keine Flut von Gesprächen
        G.evaluate("() => { T.funk.length = 0; }"); P.evaluate("() => { T.funk.length = 0; }")
        # Paul übernimmt Annas Gespräch und beendet es; danach kommt der wartende Ruf des zweiten RTW dran
        H.evaluate("async (x) => { const s = T.s(); await T.warte(() => !s.state.funkSendet, 10000); await s.call('funkMensch', true, 'leo', undefined, 'h1'); await s.call('funkMensch', false, 'leo', undefined, 'h1'); await s.call('funkMenschText', null, `${x.rtwName} von LEO, verstanden, Ende`); }", x)
        r = H.evaluate("(id) => T.warte(() => T.g(id)?.status === 'ende' || !T.g(id), 10000)", gid3)
        check(bool(r), "Paul beendet das übernommene Gespräch")
        gid4 = H.evaluate("async (x) => { const s = T.s(); s.fzRuft(s.state.fahrzeuge[x.rtw2], s.einsatz(x.e), 'info', 'Frage zur Adresse, kommen'); const g = await T.warte(() => (s.state.funkGespraeche||[]).find((g) => g.fzId === x.rtw2 && g.status !== 'ende' && g.sprueche.length), 30000); return g && g.id; }", x)
        check(gid4 is not None, f"zweiter RTW kommt nach dem Gespräch dran (Gespräch {gid4})")
        for pg, n in [(G, "Anna (jetzt Pilotin)"), (P, "Tobi")]:
            # ruft wieder, wenn niemand antwortet (Abstand wie beim echten Funk) – darum etwas länger warten
            st = pg.evaluate("(von) => T.warte(() => T.stimme(von) > 0 && T.stimme(von), 60000)", x["rtw2Name"])
            check(bool(st), f"{n} hört den neuen RTW-Ruf ({st} Stücke)")
        H.wait_for_timeout(6000)
        offen = H.evaluate("() => T.offen().map((g) => `${g.funkname}: ${g.sprueche.length} Sprüche, Führer ${g.fuehrer?.name ?? '-'}`)")
        print("   offen:", offen)
        doppelt = H.evaluate("() => { const z = {}; for (const g of T.s().state.funkGespraeche || []) for (const sp of g.sprueche) if (Date.now() - (sp.echt ?? Date.now()) < 120000) { const k = sp.von + '|' + sp.text; z[k] = (z[k] || 0) + 1; } return Object.entries(z).filter(([, n]) => n > 2); }")
        check(len(offen) <= 4 and not doppelt, f"kein Durcheinander nach dem Wechsel ({len(offen)} offene Gespräche, Wiederholungen {doppelt})")

        fehler = H.fehler + G.fehler + P.fehler
        print("\n".join(fehler[:8])); check(not fehler, "keine Fehler auf den Seiten")
        b.close()
finally:
    web.terminate()
    try: os.killpg(relay.pid, signal.SIGTERM)
    except Exception: relay.terminate()
print("FEHLER:", fails); sys.exit(1 if fails else 0)
