import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S=sys.argv[1]; DIST=sys.argv[2]
srv=subprocess.Popen([sys.executable,"-m","http.server","8823","-d",DIST],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
JS="""async (datei) => { const lw = window.__lw; await lw.codesystemLaden(await (await fetch(datei)).json()); const s = lw.sim;
  s.settings.generatorAktiv=false; const out = {};
  for (const f of lw.faelle.alleFaelle()) for (const v of f.varianten) { const k = f.id+'/'+v.id; out[k] = [];
    for (let i=0;i<4;i++) { try { const e = await s.generiereFall(f.id, v.id); const w = e.wahr.abfrage || {};
      out[k].push({ code: w.code || e.wahr.code || null, bw: (w.antworten||{}).bw ?? (w.antworten||{}).x_bw ?? null }); } catch (err) { out[k].push({ fehler: String(err).slice(0,80) }); } } }
  return out; }"""
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); res={}
    for d in ["/abf_test.json","/abf_fremd.json","/abf_fremd_zug.json"]:
      A=b.new_page(); A.goto("http://localhost:8823/?debug"); A.wait_for_timeout(2500)
      A.evaluate("() => document.querySelectorAll('.gross-overlay').forEach(o => o.hidden = true)")
      res[d]=A.evaluate(JS,d); A.close()
    json.dump(res,open(S+"/fremd_res.json","w"),ensure_ascii=False)
finally: srv.terminate()
