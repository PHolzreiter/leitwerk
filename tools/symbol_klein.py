"""Kleinversion des LeitWerk-Symbols für 16–32 px (Logo-Leitfaden: unter 32 px immer die Kleinversion mit
breiteren Lücken). Bildschirme, Tisch und Person liegen auf dem 16-px-Raster, damit die Lücken scharf bleiben.

  python3 tools/symbol_klein.py zeichnen            # PNGs in tools/symbol-klein neu zeichnen (braucht Pillow)
  python3 tools/symbol_klein.py einbauen <icons>    # nach „tauri icon“: 16/24/32 in icon.ico, icon.icns, 32x32.png
                                                    # ersetzen (nur Standardbibliothek, läuft auf allen Build-Rechnern)
"""
import io, os, struct, sys

HIER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "symbol-klein")
GROESSEN = (16, 24, 30, 32)
BLAU = (59, 139, 255, 255); GELB = (255, 199, 44, 255); NACHT = (17, 18, 22, 255)


def zeichne(S, ss=8):
    from PIL import Image, ImageDraw

    k = S / 16.0; Z = S*ss
    im = Image.new("RGBA",(Z,Z),(0,0,0,0)); d = ImageDraw.Draw(im)
    u = lambda v: v*k*ss
    P = lambda pts: [(u(x),u(y)) for x,y in pts]
    d.rounded_rectangle([0,0,Z-1,Z-1], radius=u(2.6), fill=NACHT)
    # Bildschirme (Bogen: außen tiefer), 1 px Lücke bei 16 px
    d.polygon(P([(1,3.8),(5,3.0),(5,7.0),(1,8.0)]), fill=BLAU)
    d.polygon(P([(6,3.0),(10,3.0),(10,7.0),(6,7.0)]), fill=BLAU)
    d.polygon(P([(11,3.0),(15,3.8),(15,8.0),(11,7.0)]), fill=BLAU)
    # Tisch: gelber Bogen, Mitte vom Kopf verdeckt (mit dunklem Rand)
    w = 1.3
    d.line(P([(0.9,10.8),(2.6,9.8),(5.2,8.85),(8,8.5),(10.8,8.85),(13.4,9.8),(15.1,10.8)]), fill=GELB, width=int(u(w)), joint="curve")
    # Kopf mit dunklem Ring, damit er sich vom Tisch abhebt
    cx, cy, r = 8, 9.6, 1.6
    d.ellipse([u(cx-r-1),u(cy-r-1),u(cx+r+1),u(cy+r+1)], fill=NACHT)
    d.ellipse([u(cx-r),u(cy-r),u(cx+r),u(cy+r)], fill=BLAU)
    # Körper: Halbrund, 1 px Abstand zum Kopf
    d.pieslice([u(4.7),u(12.2),u(11.3),u(17.8)], 180, 360, fill=BLAU)
    d.rectangle([u(4.6),u(15.0),u(11.4),Z], fill=NACHT)  # unten gerade abschneiden
    # Ecken wieder rund
    m = Image.new("L",(Z,Z),0); ImageDraw.Draw(m).rounded_rectangle([0,0,Z-1,Z-1], radius=u(2.6), fill=255)
    out = Image.new("RGBA",(Z,Z),(0,0,0,0)); out.paste(im,(0,0),m)
    return out.resize((S,S), Image.BOX)

def png(groesse):
    with open(os.path.join(HIER, f"klein{groesse}.png"), "rb") as f:
        return f.read()


def ico_einbauen(pfad):
    """ICO-Einträge 16/24/32 durch die Kleinversion (PNG) ersetzen, alle anderen bleiben."""
    d = open(pfad, "rb").read()
    _, typ, n = struct.unpack("<HHH", d[:6])
    eintraege = []
    for i in range(n):
        w, h, farben, _, ebenen, bits, groesse, ab = struct.unpack("<BBBBHHII", d[6 + 16 * i: 22 + 16 * i])
        w = w or 256
        eintraege.append([w, h or 256, farben, ebenen, bits, d[ab: ab + groesse]])
    da = {e[0] for e in eintraege}
    for g in (16, 24, 32):
        neu = [g, g, 0, 1, 32, png(g)]
        if g in da:
            eintraege = [neu if e[0] == g else e for e in eintraege]
        else:
            eintraege.append(neu)
    eintraege.sort(key=lambda e: e[0])
    kopf = struct.pack("<HHH", 0, typ or 1, len(eintraege))
    ab = 6 + 16 * len(eintraege)
    verz, daten = b"", b""
    for w, h, farben, ebenen, bits, b in eintraege:
        verz += struct.pack("<BBBBHHII", w % 256, h % 256, farben, 0, ebenen, bits, len(b), ab + len(daten))
        daten += b
    open(pfad, "wb").write(kopf + verz + daten)


def icns_einbauen(pfad):
    """ICNS: 16 und 32 (auch 16@2x) als PNG-Einträge mit der Kleinversion; die alten 16/32-Einträge fallen weg."""
    d = open(pfad, "rb").read()
    i, teile = 8, []
    while i < len(d):
        t, n = d[i:i + 4], struct.unpack(">I", d[i + 4:i + 8])[0]
        teile.append((t, d[i + 8:i + n]))
        i += n
    weg = {b"is32", b"s8mk", b"il32", b"l8mk", b"icp4", b"icp5", b"ic11"}
    neu = [(b"icp4", png(16)), (b"icp5", png(32)), (b"ic11", png(32))] + [(t, x) for t, x in teile if t not in weg]
    inhalt = b"".join(t + struct.pack(">I", len(x) + 8) + x for t, x in neu)
    open(pfad, "wb").write(b"icns" + struct.pack(">I", len(inhalt) + 8) + inhalt)


def einbauen(ordner):
    for name, fkt in (("icon.ico", ico_einbauen), ("icon.icns", icns_einbauen)):
        p = os.path.join(ordner, name)
        if os.path.exists(p):
            fkt(p)
            print("Kleinversion in", p)
    for name, g in (("32x32.png", 32), ("Square30x30Logo.png", 30)):
        p = os.path.join(ordner, name)
        if os.path.exists(p):
            open(p, "wb").write(png(g))
            print("Kleinversion in", p)


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "zeichnen":
        os.makedirs(HIER, exist_ok=True)
        for g in GROESSEN:
            zeichne(g).save(os.path.join(HIER, f"klein{g}.png"), optimize=True)
        print("gezeichnet:", HIER)
    elif len(sys.argv) >= 3 and sys.argv[1] == "einbauen":
        einbauen(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(2)
