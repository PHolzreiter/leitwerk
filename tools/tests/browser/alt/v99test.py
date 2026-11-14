# v0.99: Stimmungen, Menü „Anrufe & KI“, erster Start, Regel des Hosts, Funk mit Cloud-Stimmen (Schein-Gemini)
import subprocess, sys, time, json
sys.path.insert(0, sys.argv[1])
from mockrelay import Relay
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8899", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
# Schein-Gemini nur für Google; alles andere (Relay) bleibt echt
FAKE = """() => {
  const Echt = window.WebSocket; window.__gem = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.gesendet = []; window.__gem.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 20); }
    send(t) { const m = JSON.parse(t); this.gesendet.push(m);
      const an = (o, d = 10) => setTimeout(() => this.readyState === 1 && this.onmessage && this.onmessage({ data: JSON.stringify(o) }), d);
      if (m.setup) { this.sys = m.setup.systemInstruction.parts[0].text; this.stimme = m.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName; an({ setupComplete: {} }); }
      if (m.clientContent && m.clientContent.turnComplete) {
        const tx = m.clientContent.turns[0].parts[0].text; const z = /«([^»]*)»/.exec(tx); const von = (/„([^“]+)“/.exec(this.sys) || [])[1] || 'X';
        const ant = z ? z[1] : 'Hier ' + von + ', verstanden, kommen';
        const s = new Int16Array(2400); for (let i = 0; i < s.length; i++) s[i] = Math.round(8000 * Math.sin(i / 7));
        const pcm = btoa(String.fromCharCode(...new Uint8Array(s.buffer)));
        for (let k = 0; k < 3; k++) an({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm } }] } } }, 10 + k * 20);
        an({ serverContent: { outputTranscription: { text: ant } } }, 80);
        an({ serverContent: { turnComplete: true } }, 120);
      } }
    close() { this.readyState = 3; }
  }
  window.WebSocket = function (url, p) { return /generativelanguage/.test(url) ? new FakeWS(url) : new Echt(url, p); };
  window.WebSocket.OPEN = 1; window.WebSocket.CONNECTING = 0; window.WebSocket.CLOSED = 3;
  window.__gesprochen = []; try { speechSynthesis.speak = (u) => window.__gesprochen.push(u.text); } catch (e) {}
}"""
INIT = "(() => { try { const p = JSON.parse(localStorage.getItem('leitwerk.persoenlich') || '{}'); p.einfuehrung = true; localStorage.setItem('leitwerk.persoenlich', JSON.stringify(p)); } catch (e) {} const t = setInterval(() => { if (window.__lw && window.__lw.testAnordnung && document.querySelector('.lw-panel')) { clearInterval(t); setTimeout(() => window.__lw.testAnordnung(), 50); } }, 50); })()"
relay = Relay()
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        cA = b.new_context(viewport={"width": 1500, "height": 950}); cB = b.new_context(viewport={"width": 1500, "height": 950})
        for c in (cA, cB): c.route("https://tickets.leitwerk.workers.dev/**", lambda r: r.abort())
        A = cA.new_page(); B = cB.new_page()
        for pg, tag in [(A, "A"), (B, "B")]:
            pg.add_init_script(INIT)
            pg.on("pageerror", lambda e, t=tag: logs.append(f"{t} PAGEERROR {e}"))
            pg.on("console", lambda m, t=tag: logs.append(f"{t} {m.text}") if "Funk-Stimme" in m.text else None)
            relay.attach(pg, tag)
        B.add_init_script("localStorage.setItem('leitwerk.gemini', JSON.stringify({ an: false, schluessel: '', gewaehlt: true }))")
        A.goto("http://localhost:8899/?debug&erstwahl"); B.goto("http://localhost:8899/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const st = structuredClone(window.__lw.store.settings); st.generatorAktiv = false; st.ktAktiv = false; window.__lw.store.setSettings(st); window.__lw.kiPrefsSetzen({ aktiv: false }); }")

        # ---------------- Stimmungen
        r = A.evaluate("""async () => { const L = window.__lw; const s = L.sim; const ids = L.faelle.alleFaelle().filter(f => f.thema !== 'kt').map(f => f.id);
          const n = {}, art = {}; let ges = 0;
          for (let i = 0; i < 90; i++) { const e = await s.probeFall(ids[(i * 7) % ids.length]); const a = e?.wahr?.abfrage?.anrufer; if (!a) continue; ges++;
            n[a.emotion] = (n[a.emotion] || 0) + 1; if (a.stimmungArt) art[a.stimmungArt] = (art[a.stimmungArt] || 0) + 1; }
          return { n, art, ges }; }""")
        print("   ", r)
        erlaubt = {"ruhig", "gefasst", "aufgeregt", "panisch", "sehr_panisch", "extrem_panisch"}
        check(set(r["n"]) <= erlaubt and len(r["n"]) >= 4, f"Panikstufen verteilt ({len(r['n'])} verschiedene)")
        check(len(r["art"]) >= 2 and sum(r["art"].values()) < r["ges"] * 0.6, f"besondere Stimmungen kommen vor, aber nicht überall ({sum(r['art'].values())} von {r['ges']})")

        # ---------------- Menü „Anrufe & KI“
        A.click("[data-act=einstellungen]"); A.wait_for_timeout(400)
        check(A.locator(".es-punkt[data-seite=anrufe]").count() == 1 and A.locator(".es-punkt[data-seite=sprache]").count() == 0, "ein Menüpunkt „Anrufe & KI“ (Sprache ist darin)")
        A.click(".es-punkt[data-seite=anrufe]"); A.wait_for_timeout(600)
        t = A.inner_text(".es-inhalt") if A.locator(".es-inhalt").count() else A.inner_text("body")
        for w in ["Anrufer-KI", "Lokale KI (Ollama)", "Anrufe und Funk", "Notrufe im Spiel"]:
            check(w in t, f"Menü enthält „{w}“")
        check("Spracheingabe" in t or "Sprechtaste" in t, "Sprache (Eingabe/Vorlesen) ist im selben Menü")
        A.click(".ki-modus-wahl >> text=Gemini"); A.wait_for_timeout(600)
        tb = A.inner_text("body")
        check("Gemini einrichten" in tb and "aistudio.google.com" in tb, "Gemini gewählt ohne Schlüssel: Einrichtung mit Anleitung geht auf")
        A.keyboard.press("Escape"); A.wait_for_timeout(300)
        A.keyboard.press("Escape"); A.wait_for_timeout(300)

        # ---------------- erster Start: fragen
        r = A.evaluate("""async () => { const L = window.__lw; L.live.setLivePrefs({ gewaehlt: false }); L.startseite.zeigen(() => {}); await new Promise(r => setTimeout(r, 600));
          document.querySelector('.st-start')?.click(); await new Promise(r => setTimeout(r, 600));
          const da = document.body.innerText.includes('Anrufer: Gemini oder lokal?'); return da; }""")
        check(r, "erster Start: Frage Gemini oder lokal vor dem Spiel")
        A.click(".ki-wahl-karte >> text=Lokal auf diesem Rechner"); A.wait_for_timeout(1500)
        A.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")

        # ---------------- Mehrspieler: Host verlangt Gemini
        A.evaluate(FAKE); B.evaluate(FAKE)
        A.evaluate("() => { window.__lw.live.setLivePrefs({ an: true, schluessel: 'SCHEIN-SCHLUESSEL-1234567890', gewaehlt: true }); }")
        A.click("#btn-spiel"); A.wait_for_timeout(300)
        A.fill(".spiel input[placeholder^='Dein Name']", "Paul"); A.click(".spiel >> text=Spiel hosten"); A.wait_for_timeout(800)
        code = A.inner_text(".spiel-code").strip(); A.click(".dlg-foot >> text=Schließen")
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.kiRegel = 'gemini'; window.__lw.store.setSettings(st); }"); A.wait_for_timeout(300)
        B.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")
        B.click("#btn-spiel"); B.wait_for_timeout(300)
        B.fill(".spiel input[placeholder^='Dein Name']", "Max"); B.fill(".code-input", code); B.click(".spiel >> text=Beitreten"); B.wait_for_timeout(1500)
        B.wait_for_timeout(4500)
        tb = B.inner_text("body")
        check("Der Host verlangt in diesem Spiel Gemini" in tb, "Mitspieler ohne Schlüssel: Pflicht-Fenster zum Einrichten")
        check(B.locator(".dlg >> text=Spiel verlassen").count() > 0, "Pflicht-Fenster bietet „Spiel verlassen“")
        B.evaluate("() => document.querySelectorAll('.dlg-overlay, .dlg').forEach(o => o.remove())")

        # ---------------- Stimmen der Fahrzeuge
        r = A.evaluate("""() => { const L = window.__lw; const s = L.sim; const w = Object.values(s.state.fahrzeuge).filter(f => ['RTW','NEF','NAH'].includes(f.kategorie));
          const st = Object.fromEntries(w.map(f => [f.id, L.live.funkStimme(f.id)]));
          const d = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 74);
          let paare = 0, gleich = 0; for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) if (d(w[i].heim, w[j].heim) < 30) { paare++; if (st[w[i].id] === st[w[j].id]) gleich++; }
          const vorher = w.slice(0, 20).map(f => st[f.id]); w.slice(0, 20).forEach(f => f.schicht = (f.schicht || '') + '-neu');
          const neu = w.slice(0, 20).map(f => L.live.funkStimme(f.id)); const anders = neu.filter((v, i) => v !== vorher[i]).length;
          return { n: w.length, verschieden: new Set(Object.values(st)).size, paare, gleich, anders, nochmal: w.slice(0, 20).every((f, i) => L.live.funkStimme(f.id) === neu[i]) }; }""")
        print("   ", r)
        check(r["verschieden"] >= 20, f"viele verschiedene Stimmen ({r['verschieden']})")
        check(r["gleich"] <= max(2, r["paare"] * 0.05), f"Nachbarn (unter 30 km) meist verschieden: {r['gleich']} gleich von {r['paare']} Paaren")
        check(r["anders"] >= 14 and r["nochmal"], f"Schichtwechsel: neue Stimme ({r['anders']} von 20), innerhalb der Schicht gleich")

        # ---------------- Funk mit Cloud-Stimme (Host führt das Gespräch, Mitspieler hört über den Relay)
        A.click(".lw-panel[data-panel=einsatzliste] >> text=+ Test"); A.click(".ctx-menu.test >> text=Notfall"); A.wait_for_timeout(1200)
        ids = A.evaluate("""() => { const s=window.__lw.sim; const e=s.state.einsaetze[0]; const fz=Object.values(s.state.fahrzeuge);
            const rtw=fz.find(f=>f.kategorie==='RTW'&&f.phase==='frei'&&!f.funkrufname.startsWith('77/8')); s.aktualisiere(e.id, { adresse: { lat: 48.41, lon: 15.6, label: 'Krems' } }); return [e.id, rtw.id]; }""")
        A.evaluate("([e,r]) => window.__lw.sim.call('alarmiere', e, [r])", ids); A.wait_for_timeout(500)
        vor = B.evaluate("() => window.__lw.sprechfunk.statistik.empfangen")
        A.evaluate("() => window.__lw.zeige('funk')"); A.wait_for_timeout(300); A.evaluate("() => { const b = document.querySelector('.funk-fenster .funk-modus [data-m=text]'); if (b) b.click(); }")
        gid = A.evaluate("([e,r]) => window.__lw.sim.call('funkRufen', r)", ids)
        A.wait_for_timeout(7000)
        A.evaluate("async () => { const s = window.__lw.sim; for (let i = 0; i < 120 && s.funkKanalSpricht(null); i++) await new Promise(r => setTimeout(r, 150)); }"); A.fill(".funk-fenster .funk-eine input", "Hier LEO, wie ist euer Status, wann seid ihr vor Ort, kommen"); A.press(".funk-fenster .funk-eine input", "Enter"); A.wait_for_timeout(5000)
        r = A.evaluate("""(gid) => { const L = window.__lw; const g = L.sim.state.funkGespraeche.find(x => x.id === gid);
          return { sp: g.sprueche.map(x => [x.von, x.text, !!x.stimme]), lokal: window.__gesprochen, gem: window.__gem.length, stimmen: window.__gem.map(w => w.stimme) }; }""", gid)
        rb = B.evaluate("() => ({ empf: window.__lw.sprechfunk.statistik.empfangen, lokal: window.__gesprochen })")
        print("   ", json.dumps(r, ensure_ascii=False)[:700]); print("   B:", rb, "vorher", vor)
        fz_sp = [s for s in r["sp"] if s[0] != "LEO"]
        check(len(fz_sp) >= 2, f"Fahrzeug spricht ({len(fz_sp)} Sprüche)")
        check(any(s[2] and "verstanden" in s[1] for s in fz_sp), "Antwort von Gemini formuliert und mit Stimme übertragen (nicht noch einmal vorgelesen)")
        check(r["gem"] >= 2 and len(set(r["stimmen"])) == 1, f"eine Stimme für das Fahrzeug ({set(r['stimmen'])})")
        check(not r["lokal"], "Gesprächsführer liest nichts zusätzlich mit der Stimme hier vor")
        check(rb["empf"] - vor >= 4, f"Mitspieler bekommt den Ton über den Funk ({rb['empf'] - vor} Stücke)")
        check(not rb["lokal"], "Mitspieler liest nichts selbst vor")
        A.evaluate("async () => { const s = window.__lw.sim; for (let i = 0; i < 120 && s.funkKanalSpricht(null); i++) await new Promise(r => setTimeout(r, 150)); }"); A.evaluate("() => window.__lw.sim.funkLeo('Verstanden, Ende')"); A.wait_for_timeout(500)

        # ---------------- Gemini aus: wie bisher (Stimme hier)
        A.evaluate("() => window.__lw.live.setLivePrefs({ an: false })")
        A.evaluate("() => { const st = structuredClone(window.__lw.store.settings); st.kiRegel = 'frei'; window.__lw.store.setSettings(st); }"); A.wait_for_timeout(300)
        A.evaluate("() => { window.__gesprochen.length = 0; }")
        A.evaluate("([e,r]) => window.__lw.sim.call('funkRufen', r)", ids); A.wait_for_timeout(9000)
        r = A.evaluate("() => window.__gesprochen")
        print("   lokal:", r)
        check(len(r) >= 1, "ohne Gemini: Fahrzeug spricht mit der Stimme hier")
        b.close()
except Exception as ex:
    print("FEHLER Ausnahme", ex); fails += 1
finally:
    srv.terminate()
print("ALLES OK" if fails == 0 else f"FEHLER: {fails}")
for l in logs[:30]: print(l)
