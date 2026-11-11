# Freisprechen: Sprach-Tor vor Gemini – Geräusche gehen als Stille hinaus, Sprache (mit Anfang) kommt durch
# Aufruf: python3 freisprechtest.py <arbeitsordner> <web-build>
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
DIST = sys.argv[2]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8924", "-d", DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); fails = 0
def check(ok, w):
    global fails
    print(("OK    " if ok else "FEHLER"), w); fails += 0 if ok else 1
LAUF = r"""([art, anrufer]) => {
  let uhr = 0; const raus = [];
  let jetzt = null;
  const tor = window.__lw.sprachTor((b) => { jetzt.push(b); raus.push(b); }, () => uhr, () => anrufer);
  const stueck = (amp, ton) => { const n = 1600; const u = new Uint8Array(n * 2); const v = new DataView(u.buffer);
    for (let i = 0; i < n; i++) { const x = ton ? amp * Math.sin(2 * Math.PI * 220 * (uhr / 1000 + i / 16000)) * (0.6 + 0.4 * Math.sin(i / 90)) : amp * (Math.random() * 2 - 1); v.setInt16(i * 2, Math.round(x * 32767), true); }
    let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
  const laut = (b) => { const r = atob(b); let q = 0; for (let i = 0; i < r.length; i += 2) { let v = r.charCodeAt(i) | (r.charCodeAt(i + 1) << 8); if (v >= 0x8000) v -= 0x10000; q += (v / 32768) ** 2; } return Math.sqrt(q / (r.length / 2)); };
  const folge = [];
  // 2 s Raumrauschen
  for (let i = 0; i < 20; i++) folge.push(['rausch', stueck(0.003, false)]);
  if (art === 'tippen') for (let i = 0; i < 20; i++) folge.push(['tippen', stueck(i % 3 === 0 ? 0.05 : 0.003, false)]);
  if (art === 'sprache') { for (let i = 0; i < 15; i++) folge.push(['sprache', stueck(0.12, true)]); for (let i = 0; i < 15; i++) folge.push(['danach', stueck(0.003, false)]); }
  if (art === 'leise') for (let i = 0; i < 15; i++) folge.push(['sprache', stueck(0.03, true)]);
  const proStueck = [];
  for (const [, b] of folge) { jetzt = []; tor.stueck(b); proStueck.push(jetzt); uhr += 100; }
  const anteil = (was) => { let n = 0, d = 0; folge.forEach(([w], i) => { if (w === was) { n++; if (laut(proStueck[i][proStueck[i].length - 1]) > 0.001) d++; } }); return n ? d / n : null; };
  const gesendet = raus.filter((b) => laut(b) > 0.02).length;
  return { gesendet, raus: raus.length, rein: folge.length, rausch: anteil('rausch'), tippen: anteil('tippen'), sprache: anteil('sprache'), danach: anteil('danach'), zahlen: tor.zahlen() };
}"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); A = b.new_page()
        A.goto("http://localhost:8924/?debug"); A.wait_for_timeout(2500)
        r = A.evaluate(LAUF, ["tippen", True]); print("   ", r)
        check(r["raus"] >= r["rein"] - 1 and r["tippen"] == 0 and r["rausch"] == 0, "Tippen während der Anrufer spricht: geht als Stille hinaus (keine Unterbrechung)")
        r = A.evaluate(LAUF, ["sprache", True]); print("   ", r)
        check(r["gesendet"] >= 14, "deutliche Sprache während der Anrufer spricht kommt durch (Anfang nachgereicht)")
        check(r["danach"] is not None and r["danach"] < 0.6, "nach der Sprache schließt das Tor wieder")
        r = A.evaluate(LAUF, ["leise", False]); print("   ", r)
        check(r["sprache"] >= 0.9, "leise Sprache, Anrufer still: kommt durch")
        r = A.evaluate(LAUF, ["tippen", False]); print("   ", r)
        check(r["tippen"] <= 0.7, f"Tippen, Anrufer still: höchstens teilweise ({r['tippen']})")
        b.close()
finally:
    srv.terminate()
print("FEHLER:", fails); sys.exit(1 if fails else 0)
