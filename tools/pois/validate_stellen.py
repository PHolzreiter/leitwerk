"""Validate einsatzstellen CSV.  Usage: python3 -I validate_stellen.py CAND_PKL STELLEN_CSV"""
import sys, re, os, pickle, collections
from shapely.geometry import Point
from shapely.prepared import prep
if len(sys.argv) != 3:
    sys.exit('usage: validate_stellen.py CAND_PKL STELLEN_CSV')
C = pickle.load(open(sys.argv[1], 'rb'))
NOE = prep([a for a in C['admin'] if a['id'] == 77189][0]['g'].buffer(0))
TYPES = set('''autobahn landstrasse feldweg radweg wald berg ufer weinberg feld bahnuebergang bruecke tunnel anschlussstelle
kreisverkehr kreuzung kellergasse hochstand windrad sendemast biogasanlage kletterfels klettersteig'''.split())
f = sys.argv[2]
raw = open(f, encoding='utf-8').read()
lines = raw.split('\n')
assert lines[0] == 'typ;breitengrad;laengengrad;name;ort;info', lines[0]
assert raw.endswith('\n')
err = collections.Counter(); seen = set(); cnt = collections.Counter(); noort = 0
for l in lines[1:]:
    if not l: continue
    r = l.split(';')
    if len(r) != 6: err['cols'] += 1; continue
    typ, la, lo, nm, ort, info = r
    if typ not in TYPES: err['bad typ'] += 1
    if not (re.match(r'^\d+\.\d{5}$', la) and re.match(r'^\d+\.\d{5}$', lo)): err['coord fmt'] += 1; continue
    if not NOE.contains(Point(float(lo), float(la))): err['outside NÖ'] += 1
    key = (typ, la, lo)
    if key in seen: err['exact dup'] += 1
    seen.add(key)
    if (la, lo) in {k[1:] for k in []}: pass
    if not ort: noort += 1
    cnt[typ] += 1
coords = collections.Counter((l.split(';')[1], l.split(';')[2]) for l in lines[1:] if l)
print('rows', sum(cnt.values()), 'size %.2f MB' % (os.path.getsize(f) / 1e6), 'errors', dict(err), 'rows without ort', noort,
      'same coords different typ', sum(1 for v in coords.values() if v > 1))
for k in sorted(cnt): print(f'  {k:16s}{cnt[k]}')
