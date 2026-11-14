import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S = sys.argv[1]; DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8820", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0; logs = []
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w)
    if not ok: fails += 1
FAKE = """() => {
  window.__ws = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.gesendet = []; window.__ws.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 20); }
    send(t) { const m = JSON.parse(t); this.gesendet.push(m);
      const an = (o) => setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify(o) }), 10);
      if (m.setup) { this.frei = !m.setup.realtimeInputConfig.automaticActivityDetection.disabled; if (/FALSCH/.test(this.url)) { setTimeout(() => { this.readyState = 3; this.onclose && this.onclose({ code: 1008, reason: 'API key not valid' }); }, 10); return; } an({ setupComplete: {} }); }
      if (this.frei && m.realtimeInput && m.realtimeInput.audio) { this.n = (this.n || 0) + 1; if (this.n === 3) {
        an({ serverContent: { inputTranscription: { text: 'Wie alt ist er?' } } });
        setTimeout(() => { this.onmessage({ data: JSON.stringify({ serverContent: { outputTranscription: { text: 'Er ist so um die sechzig.' } } }) }); this.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) }); }, 40);
      } }
      if (m.realtimeInput && m.realtimeInput.activityEnd) {
        an({ serverContent: { inputTranscription: { text: 'Ist er bei ' } } });
        an({ serverContent: { inputTranscription: { text: 'Bewusstsein?' } } });
        an({ serverContent: { outputTranscription: { text: 'Ja, er redet mit mir.' } } });
        an({ usageMetadata: { totalTokenCount: 1234 } });
        setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) }), 60);
      }
      if (m.clientContent && m.clientContent.turnComplete) {
        const pcm = btoa(String.fromCharCode(...new Uint8Array(new Int16Array(2400).buffer)));
        an({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm } }] } } });
        const tx = m.clientContent.turns[0].parts[0].text;
        if (/Korrektur/.test(tx)) an({ serverContent: { outputTranscription: { text: 'Nein, Moment – er atmet ganz normal.' } } });
        else if (/Atmet er/.test(tx)) an({ serverContent: { outputTranscription: { text: 'Er kriegt ganz schlecht Luft.' } } });
        else { an({ serverContent: { outputTranscription: { text: 'Ja, er ist ' } } }); an({ serverContent: { outputTranscription: { text: 'wach und redet.' } } }); }
        setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) }), 60);
      } }
    close() { this.readyState = 3; }
  }
  FakeWS.OPEN = 1; window.WebSocket = FakeWS;
}"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page(); A.on("pageerror", lambda e: logs.append(f"PAGEERROR {e}")); A.on("console", lambda m: logs.append("CONSOLE " + m.text) if ("Gemini" in m.text or "Korrektur" in m.text) else None)
        A.goto("http://localhost:8820/?debug"); A.wait_for_timeout(2000)
        A.evaluate("async () => window.__lw.codesystemLaden(await (await fetch('/abf_test.json')).json())"); A.wait_for_timeout(1200)
        A.evaluate("() => { document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true); const s = window.__lw.sim; s.settings.generatorAktiv = false; s.settings.ktAktiv = false; s.state.naechster = { stabil: 1e15, dringend: 1e15, kritisch: 1e15 }; }")
        A.evaluate(FAKE)
        A.evaluate("() => { const s = window.__lw.sim; const alt = s.call.bind(s); window.__nachr = []; s.call = (n, ...a) => { if (n === 'anrufNachricht') window.__nachr.push({ von: a[1], text: a[2] }); return alt(n, ...a); }; }")
        r = A.evaluate("""async () => { const L = window.__lw; L.live.setLivePrefs({ an: true, schluessel: 'AIzaTESTSCHLUESSEL123' });
          const e = await L.sim.probeFall('brustschmerz', '0'); e.anruf.status = 'aktiv'; L.sim.state.einsaetze.push(e); window.__e1 = e; e.wahr.abfrage.anrufer.selbst = false; e.wahr.abfrage.antworten.at = 'normal'; const k = L.kontext(e); k.anrufer = { ...k.anrufer, art: 'privat', selbst: false };
          const gezeigt = []; await L.fragen(e, 'Ist er wach?', undefined, (t) => gezeigt.push(t));
          await L.fragen(e, 'Atmet er normal?', undefined, () => {});
          const ws = window.__ws; const g = ws[0].gesendet;
          return { n: ws.length, url: ws[0].url, setup: g[0].setup, turns: g.filter(m => m.clientContent).map(m => m.clientContent), letzte: window.__nachr.filter(m => m.von === 'anrufer')[0], gezeigt }; }""")
        print("   ", json.dumps({**r, "setup": {**r["setup"], "systemInstruction": "…"}}, ensure_ascii=False)[:900])
        check("key=AIzaTESTSCHLUESSEL123" in r["url"] and "BidiGenerateContent" in r["url"], "Verbindung zu Gemini Live mit dem eigenen Schlüssel")
        check(r["setup"]["model"] == "models/gemini-3.8-live" and r["setup"]["generationConfig"]["responseModalities"] == ["AUDIO"] and "outputAudioTranscription" in r["setup"], "Setup: Modell, Audio-Antwort, Mitschrift")
        check(r["n"] == 1, "eine Verbindung pro Anruf (wird wiederverwendet)")
        check(any("Ist er wach?" in t["turns"][0]["parts"][0]["text"] for t in r["turns"] if t["turnComplete"]), "Frage geht als Text an Gemini")
        check(r["letzte"]["von"] == "anrufer" and r["letzte"]["text"] == "Ja, er ist wach und redet.", "Mitschrift der Antwort steht im Gespräch")
        check("".join(r["gezeigt"]) == "Ja, er ist wach und redet.", "Antwort wird live angezeigt")
        # Korrektur: falsche Antwort → Anrufer verbessert sich selbst
        r = A.evaluate("""async () => { await new Promise(r => setTimeout(r, 900)); const kor = window.__nachr.filter(m => m.von === 'anrufer').map(m => m.text);
          const hin = window.__ws[0].gesendet.filter(m => m.clientContent && /Korrektur/.test(m.clientContent.turns[0].parts[0].text)).length; const st = window.__lw.sim.state.einsaetze; st.splice(st.indexOf(window.__e1), 1); return { kor, hin }; }""")
        print("   ", r)
        check(r["hin"] == 1 and "Er kriegt ganz schlecht Luft." in r["kor"] and "Nein, Moment – er atmet ganz normal." in r["kor"], "falsche Antwort: Anrufer bekommt leise Korrektur und verbessert sich selbst")
        # Freisprechen
        r = A.evaluate("""async () => { const L = window.__lw; window.__nachr = []; window.__ws = []; L.live.setLivePrefs({ freisprechen: true });
          const e = await L.sim.probeFall('brustschmerz', '0'); e.anruf.status = 'aktiv'; L.sim.state.einsaetze.push(e); const k = L.kontext(e); k.anrufer = { ...k.anrufer, art: 'privat' };
          const senden = L.live.liveFreisprechen(e); if (!senden) return { s: null }; senden('AAAA'); senden('BBBB'); senden('CCCC');
          await new Promise(r => setTimeout(r, 600)); const setup = window.__ws[0].gesendet[0].setup.realtimeInputConfig;
          L.live.setLivePrefs({ freisprechen: false }); L.sim.state.einsaetze.splice(L.sim.state.einsaetze.indexOf(e), 1); return { s: true, nachr: window.__nachr, setup }; }""")
        print("   ", r)
        check(r.get("s") and r["setup"]["automaticActivityDetection"]["disabled"] is False, "Freisprechen: Gemini erkennt selbst, wann du fertig bist")
        check(r.get("nachr", [])[:2] == [{"von": "leitstelle", "text": "Wie alt ist er?"}, {"von": "anrufer", "text": "Er ist so um die 60."}], "Freisprechen: Frage und Antwort stehen im Gespräch")
        # Sprache direkt an Gemini
        r = A.evaluate("""async () => { const L = window.__lw; window.__nachr = []; window.__ws = [];
          const e = await L.sim.probeFall('brustschmerz', '0'); e.anruf.status = 'aktiv'; const k = L.kontext(e); k.anrufer = { ...k.anrufer, art: 'privat' };
          let danach = 0; const st = L.live.liveSprechStrom(e, () => {}, () => danach++); if (!st) return { st: null };
          st.stueck('AAAA'); st.stueck('BBBB'); await st.ende();
          const g = window.__ws[0].gesendet.map(m => Object.keys(m.realtimeInput ?? m)[0]);
          return { st: true, nachr: window.__nachr, g, danach, setup: window.__ws[0].gesendet[0].setup.realtimeInputConfig, zeit: L.zeitenLetzte ? 0 : 0 }; }""")
        print("   ", r)
        check(r.get("st") and r["g"][:5] == ["setup", "activityStart", "audio", "audio", "activityEnd"], "Sprechtaste: Ton geht direkt an Gemini (Start, Stücke, Ende)")
        check(r.get("setup") == {"automaticActivityDetection": {"disabled": True}}, "Sprechtaste steuert, wann gesprochen wird")
        check([m["von"] for m in r["nachr"]] == ["leitstelle", "anrufer"] and r["nachr"][0]["text"] == "Ist er bei Bewusstsein?" and r["nachr"][1]["text"] == "Ja, er redet mit mir.", "Mitschrift von Frage und Antwort steht im Gespräch")
        check(r["danach"] == 1, "Abschluss wird gemeldet")
        # falscher Schlüssel → lokale Antwort
        r = A.evaluate("""async () => { const L = window.__lw; window.__nachr = []; L.live.setLivePrefs({ schluessel: 'AIzaFALSCH12345678' });
          const e = await L.sim.probeFall('brustschmerz', '0'); e.anruf.status = 'aktiv'; const k = L.kontext(e); k.anrufer = { ...k.anrufer, art: 'privat' };
          await L.fragen(e, 'Ist er wach?', undefined, () => {}); const q = L.live.kiQuelleVon(e.id); const t = q ? (q.art + ': ' + (q.ersatz || '')) : '';
          L.live.setLivePrefs({ an: false, schluessel: '' }); return { letzte: window.__nachr.slice(-1)[0], t }; }""")
        print("   ", r)
        check(r["letzte"]["von"] == "anrufer" and r["letzte"]["text"], "falscher Schlüssel: Antwort kommt trotzdem (lokal)")
        check("Schlüssel ungültig" in r["t"] and not r["t"].startswith("gemini"), "falscher Schlüssel: Symbol am Rand zeigt Ersatz mit Grund")
except Exception as ex:
    print("FEHLER Ausnahme", ex); fails += 1
finally:
    srv.terminate()
for l in logs: print(l)
print("FEHLER gesamt:", fails) if fails else print("ALLES OK")
