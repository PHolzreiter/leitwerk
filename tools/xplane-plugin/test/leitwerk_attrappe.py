"""Nachgebautes LeitWerk (EFB-Server) für den Plugin-Test: /ping, /stand, /befehl, /kachel/z/y/x.png

  python3 leitwerk_attrappe.py <stand-datei> <befehle.log> [port]

Die Stand-Datei wird bei jeder Anfrage neu gelesen (Test kann sie austauschen).
Kacheln sind erzeugte Bilder (grün mit Gitter), weil die echte Karte hier nicht erreichbar ist.
"""
import io
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image, ImageDraw

STAND, LOG = sys.argv[1], sys.argv[2]
PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 47900
CACHE = {}


def kachel(z, y, x):
    k = (z, y, x)
    if k not in CACHE:
        im = Image.new("RGB", (256, 256), (221, 227, 213))
        d = ImageDraw.Draw(im)
        for i in range(0, 256, 64):
            d.line([(i, 0), (i, 256)], fill=(200, 208, 190))
            d.line([(0, i), (256, i)], fill=(200, 208, 190))
        d.line([(0, 140), (256, 120)], fill=(250, 250, 250), width=6)
        d.line([(80, 0), (100, 256)], fill=(170, 200, 230), width=10)
        d.text((6, 6), f"{z}/{y}/{x}", fill=(120, 130, 120))
        b = io.BytesIO()
        im.save(b, "PNG")
        CACHE[k] = b.getvalue()
    return CACHE[k]


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def antwort(self, code, typ, body):
        self.send_response(code)
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/ping":
            return self.antwort(200, "text/plain", b"leitwerk")
        if p == "/stand":
            with open(STAND, "rb") as f:
                return self.antwort(200, "application/json; charset=utf-8", f.read())
        if p.startswith("/kachel/"):
            z, y, x = p[len("/kachel/"):-4].split("/")
            return self.antwort(200, "image/png", kachel(int(z), int(y), int(x)))
        self.antwort(404, "text/plain", b"")

    def do_POST(self):
        n = int(self.headers.get("Content-Length", "0") or 0)
        b = self.rfile.read(n).decode("utf-8", "replace")
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(b + "\n")
        self.antwort(200, "text/plain", b"ok")


ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
