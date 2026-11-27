# Telefon-Geräusche (Beta 82): Vorschauen von freesound.org (tools/klang/laden.py) schneiden, Schleifen nahtlos, mono 22 kHz MP3 → public/klang + src/data/klang.json
import json, subprocess, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from auswahl import A
RATE = 22050
info = json.load(open("info.json")) if os.path.exists("info.json") else {}
def dekodieren(pfad):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", pfad, "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"], capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.float32).copy()
def kodieren(x, pfad):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "-", "-af", "highpass=f=120", "-c:a", "libmp3lame", "-b:a", "40k", pfad], input=x.astype(np.float32).tobytes(), check=True)
def rms(x): return float(np.sqrt(np.mean(x ** 2)) + 1e-9)
aus = []; zaehler = {}
for k, art, fid, liz, a, l in A:
    roh = f"roh/{fid}.ogg"
    if not os.path.exists(roh): print("fehlt", fid); continue
    x = dekodieren(roh)
    s = int(a * RATE); n = int(l * RATE)
    if art == "loop":
        F = int(min(2.0, l / 6) * RATE)
        seg = x[s: s + n + F]
        if len(seg) < n + F: seg = x[: n + F] if len(x) >= n + F else x
        n2 = len(seg) - F
        kopf = seg[:F]; schwanz = seg[n2:n2 + F]
        w = np.linspace(0, 1, F)
        y = np.concatenate([kopf * np.sqrt(w) + schwanz * np.sqrt(1 - w), seg[F:n2]])
        y = y / rms(y) * 0.05  # Schleifen: gleiche Lautheit (~ -26 dBFS RMS)
        y = np.clip(y, -0.98, 0.98)
    else:
        y = x[s: s + n]
        # Stille vorne/hinten weg
        hull = np.convolve(np.abs(y), np.ones(441) / 441, mode="same")
        idx = np.where(hull > hull.max() * 0.03)[0]
        if len(idx): y = y[max(0, idx[0] - 200): idx[-1] + 2000]
        y = y / (np.max(np.abs(y)) + 1e-9) * 0.7
        f = min(len(y) // 4, int(0.02 * RATE)); y[-f:] *= np.linspace(1, 0, f)
    zaehler[k] = zaehler.get(k, 0) + 1
    datei = f"{k}_{zaehler[k]}.mp3"
    kodieren(y, f"fertig/{datei}")
    i = info.get(str(fid), info.get(fid, {}))
    aus.append({"datei": datei, "tag": k, "art": art, "laut": 1.0, "urheber": i.get("user", ""), "lizenz": "CC0" if i.get("lizenz") == "zero" else "CC BY 4.0" if i.get("lizenz") == "by" else "?", "titel": i.get("titel", "").split(" by ")[0], "quelle": f"https://freesound.org/s/{fid}/"})
    print(datei, f"{len(y)/RATE:.1f}s", os.path.getsize(f"fertig/{datei}"))
json.dump(aus, open("klang.json", "w"), ensure_ascii=False, indent=1)
print("gesamt KB", sum(os.path.getsize("fertig/" + d["datei"]) for d in aus) // 1024)
