import csv, sys, re, pickle, difflib, collections, math
from shapely.geometry import Point
from shapely.prepared import prep
from shapely.strtree import STRtree
# Usage: python3 -I validate.py CAND_PKL POI_CSV   (CAND_PKL from extract.py, used for the NÖ boundary)
if len(sys.argv) != 3:
    sys.exit('usage: validate.py CAND_PKL POI_CSV')
d = pickle.load(open(sys.argv[1], 'rb'))
NOE = prep([a for a in d['admin'] if a['id'] == 77189][0]['g'].buffer(0))
KEYS = set('''pflegeheim betreutes_wohnen behinderteneinrichtung kinderkrippe kindergarten volksschule mittelschule hoehere_schule
berufsschule sonderschule hochschule arztpraxis primaerversorgung reha bahnhof haltestelle raststation supermarkt einkaufszentrum
baumarkt sportplatz sporthalle fitnessstudio reitanlage tennis golf kletteranlage skigebiet eislaufplatz motorsport freibad hallenbad
therme badesee freizeitpark tierpark veranstaltung museum campingplatz ausflugsziel disco heuriger hotel industrie steinbruch
saegewerk lagerhaus kraftwerk landeplatz'''.split())
f = sys.argv[2]
raw = open(f, encoding='utf-8').read()
lines = raw.split('\n')
assert lines[0] == 'id;name;typ;ort;breitengrad;laengengrad;hinweis', lines[0]
assert raw.endswith('\n')
rows = [l.split(';') for l in lines[1:] if l]
err = collections.Counter()
ids = set(); coords = set()
for r in rows:
    if len(r) != 7: err['cols'] += 1; continue
    i, n, t, o, la, lo, h = r
    if not re.match(r'^poi-([nwr]\d+|x-[a-z0-9-]+)$', i): err['id fmt'] += 1
    if i in ids: err['dup id'] += 1
    ids.add(i)
    if not n.strip(): err['empty name'] += 1
    ks = t.split(',')
    if any(k not in KEYS for k in ks) or len(set(ks)) != len(ks): err['bad key'] += 1; print('badkey', r)
    if not o: err['no ort'] += 1
    if not (re.match(r'^\d+\.\d{6}$', la) and re.match(r'^\d+\.\d{6}$', lo)): err['coord fmt'] += 1
    elif not NOE.contains(Point(float(lo), float(la))): err['outside NÖ'] += 1; print('outside', r)
    if (la, lo) in coords: err['dup coords'] += 1; print('dupcoord', r)
    coords.add((la, lo))
    if len(h) > 80: err['hinweis>80'] += 1
print('rows', len(rows), 'errors', dict(err))
# duplicate scan
def fold(s):
    import unicodedata
    s = s.lower().replace('ß', 'ss'); s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c)); return ' '.join(re.sub(r'[^a-z0-9]+', ' ', s).split())
P = [Point(float(r[5]), float(r[4])) for r in rows]
T = STRtree(P)
sus = []
for i, r in enumerate(rows):
    for j in T.query(P[i].buffer(0.0035)):
        if j <= i: continue
        s = rows[j]
        dd = math.hypot((P[i].x - P[j].x) * 74100, (P[i].y - P[j].y) * 111200)
        if dd > 250: continue
        a, b = fold(re.sub(r'\(.*?\)', '', r[1])), fold(re.sub(r'\(.*?\)', '', s[1]))
        ratio = difflib.SequenceMatcher(None, a, b).ratio()
        same_key = set(r[2].split(',')) & set(s[2].split(','))
        if (ratio >= 0.85 or a == b) or (same_key and dd < 25):
            sus.append((round(dd), r[1], r[2], s[1], s[2], r[0], s[0]))
print('suspicious pairs', len(sus))
for x in sus[:400]: print('  ', x)
