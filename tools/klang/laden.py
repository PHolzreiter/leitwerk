import json, subprocess, os, re, html
from auswahl import A
os.makedirs("roh", exist_ok=True)
info = {}
for k, art, fid, liz, a, l in A:
    if fid in info: continue
    # Seite des Geräuschs: Nutzer, Titel, Lizenz, Vorschau-URL
    h = subprocess.run(["curl", "-s", "-m", "25", "-L", "-A", "Mozilla/5.0", f"https://freesound.org/s/{fid}/"], capture_output=True, text=True).stdout
    ogg = re.search(r'https://cdn\.freesound\.org/previews/[^"]*-hq\.ogg', h) or re.search(r'https://cdn\.freesound\.org/previews/[^"]*-lq\.ogg', h)
    titel = html.unescape((re.search(r'<meta property="og:title" content="([^"]*)"', h) or [None, ""])[1])
    user = (re.search(r'/people/([^/]+)/sounds/%d' % fid, h) or [None, ""])[1]
    lz = re.findall(r'creativecommons\.org/(?:licenses|publicdomain)/([a-z-]+)/', h)
    url = ogg.group(0).replace("-lq.ogg", "-hq.ogg") if ogg else None
    info[fid] = {"titel": titel, "user": user, "lizenz": lz[0] if lz else "?", "ogg": url}
    if url:
        subprocess.run(["curl", "-s", "-m", "60", "-o", f"roh/{fid}.ogg", url])
    print(fid, user, lz[:1], titel[:50], os.path.getsize(f"roh/{fid}.ogg") if url and os.path.exists(f"roh/{fid}.ogg") else "FEHLT")
json.dump(info, open("info.json", "w"), ensure_ascii=False, indent=1)
