import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
S=sys.argv[1]; D=sys.argv[2]
srv=subprocess.Popen([sys.executable,"-m","http.server","8931","-d",D],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
f=[x for x in os.listdir(D+"/assets") if x.startswith("rdprio01")][0]
with sync_playwright() as p:
    b=p.chromium.launch(); A=b.new_page(); A.goto("http://localhost:8931/")
    print(A.evaluate("async (u) => { const c = new AudioContext(); const b = await c.decodeAudioData(await (await fetch(u)).arrayBuffer()); return b.duration; }", "/assets/"+f))
    b.close()
srv.terminate()
