import re, sys, json, html, urllib.parse, subprocess
def suche(q, lizenz="Creative Commons 0", seite=1, sort="Downloads (most first)"):
    f = f'license:"{lizenz}"'
    url = "https://freesound.org/search/?" + urllib.parse.urlencode({"q": q, "f": f, "s": sort, "page": seite})
    h = subprocess.run(["curl", "-s", "-m", "25", "-A", "Mozilla/5.0", url], capture_output=True, text=True).stdout
    out = []
    for m in re.finditer(r'class="bw-player"(.*?)tabindex', h, re.S):
        b = m.group(1)
        g = lambda k: (re.search(k + r'="([^"]*)"', b) or [None, ""])[1]
        out.append({"id": int(g("data-sound-id")), "user": g("data-username"), "titel": html.unescape(g("data-title")), "dauer": float(g("data-duration") or 0),
                     "dl": int(g("data-num-downloads") or 0), "ogg": g("data-ogg").replace("-lq.ogg", "-hq.ogg"), "lizenz": lizenz})
    return out
if __name__ == "__main__":
    q = sys.argv[1]; liz = sys.argv[2] if len(sys.argv) > 2 else "Creative Commons 0"
    for r in suche(q, liz)[:12]: print(f'{r["id"]:>8} {r["dauer"]:7.1f}s {r["dl"]:>6} {r["user"][:16]:16} {r["titel"][:70]}')
