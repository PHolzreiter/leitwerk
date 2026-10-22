"""Build the LeitWerk 'Einsatzstellen' file: incident locations that are not shown as POIs on the map
(sampled lines/areas and 'invisible' point features) for Niederösterreich.

Usage: python3 -I build_stellen.py INPUT.osm.pbf CAND_PKL OUT_CSV [--max-rows N]
  INPUT.osm.pbf  NÖ extract (e.g. https://osm.download.movisda.io/admin/AT-3-latest.osm.pbf)
  CAND_PKL       output of extract.py (used for the NÖ boundary, Gemeinden, place nodes, huts)
  OUT_CSV        output file (typ;breitengrad;laengengrad;name;ort;info)
"""
import sys, re, math, pickle, collections, argparse, time
import osmium
import shapely
from shapely import wkb as swkb
from shapely.geometry import Point, LineString, MultiLineString, box
from shapely.ops import linemerge, unary_union
from shapely.strtree import STRtree
from shapely.prepared import prep

ap = argparse.ArgumentParser()
ap.add_argument('pbf'); ap.add_argument('cand'); ap.add_argument('out')
ap.add_argument('--max-rows', type=int, default=60000)
ARGS = ap.parse_args()
T0 = time.time()
def log(*a): print('[%5.0fs]' % (time.time() - T0), *a, flush=True)

# ------------------------------------------------------------------ projection (local metres)
KX, KY = 74100.0, 111200.0
def proj(g): return shapely.transform(g, lambda c: c * [KX, KY])
def unproj_xy(x, y): return (y / KY, x / KX)   # -> lat, lon

# ------------------------------------------------------------------ boundaries / places from cand
C = pickle.load(open(ARGS.cand, 'rb'))
NOE_LL = [a for a in C['admin'] if a['id'] == 77189][0]['g'].buffer(0)
NOE = proj(NOE_LL); NOEP = prep(NOE)
GEM = []
for a in C['admin']:
    if a['tags'].get('admin_level') in ('8', '6'):
        g = proj(a['g'].buffer(0))
        if NOEP.contains(g.representative_point()):
            GEM.append((a['tags']['admin_level'], a['tags'].get('name'), g))
GEM.sort(key=lambda x: x[0], reverse=True)  # level 8 first
GEMT = STRtree([g for _, _, g in GEM])
PLACES = []   # (name, rank, point)
RANK = {'city': 3, 'town': 3, 'village': 2, 'hamlet': 1}
for r in C['recs']:
    t = r['tags']
    if r['t'] == 'n' and t.get('place') in RANK and t.get('name'):
        PLACES.append((t['name'], RANK[t['place']], proj(r['g'])))
PT = STRtree([p for _, _, p in PLACES])
BIGPL = [p for p in PLACES if p[1] >= 2]
BIGPT = STRtree([p for _, _, p in BIGPL])

def gemeinde(p):
    best = None
    for i in GEMT.query(p):
        lvl, nm, g = GEM[i]
        if g.contains(p) and (best is None or lvl > best[0]):
            best = (lvl, nm)
    if best and not best[1].startswith('Bezirk '): return best[1]
    near = [(GEM[i][2].distance(p), GEM[i][1]) for i in GEMT.query(p.buffer(500)) if GEM[i][0] == '8']
    return min(near)[1] if near else ''

def ort(p):
    cand = [(PLACES[i], PLACES[i][2].distance(p)) for i in PT.query(p.buffer(3000))]
    big = [c for c in cand if c[0][1] >= 2 and c[1] <= 3000]
    if big: return min(big, key=lambda c: c[1])[0][0]
    ham = [c for c in cand if c[0][1] == 1 and c[1] <= 1500]
    if ham: return min(ham, key=lambda c: c[1])[0][0]
    return gemeinde(p)

def near_village(p, d=250):
    return any(BIGPL[i][2].distance(p) <= d for i in BIGPT.query(p.buffer(d)))

# ------------------------------------------------------------------ collectors
ROWS = []   # (typ, x, y, name, info)
def add(typ, p, name='', info=''):
    ROWS.append((typ, p.x, p.y, (name or '').strip(), (info or '').strip()))

ROADCLS = {'motorway': 6, 'trunk': 5, 'primary': 4, 'secondary': 3, 'tertiary': 2, 'unclassified': 1}
ACTIVE_RAIL = {'rail', 'narrow_gauge', 'light_rail', 'funicular', 'preserved'}

# pass 0: relations (cycle routes, via ferrata)
cyc_rel = {}       # rel id -> (name, network)
cyc_way = collections.defaultdict(list)
ferrata_way = {}
for o in osmium.FileProcessor(ARGS.pbf, osmium.osm.RELATION):
    tg = o.tags
    if tg.get('type') != 'route': continue
    if tg.get('route') == 'bicycle' and tg.get('name') and tg.get('network') in ('icn', 'ncn', 'rcn', 'lcn'):
        cyc_rel[o.id] = (tg['name'], tg['network'])
        for m in o.members:
            if m.type == 'w': cyc_way[m.ref].append(o.id)
    if tg.get('route') in ('ferrata', 'via_ferrata') or (tg.get('route') == 'climbing' and 'ferrata' in (tg.get('name', '') + tg.get('climbing', '')).lower()):
        for m in o.members:
            if m.type == 'w': ferrata_way[m.ref] = tg.get('name', '')
log('relations: cycle routes', len(cyc_rel), 'member ways', len(cyc_way), 'ferrata ways', len(ferrata_way))

# pass 1: everything else
wkbf = osmium.geom.WKBFactory()
def line_of(o):
    return proj(swkb.loads(wkbf.create_linestring(o), hex=True))

motorway = collections.defaultdict(list)     # ref -> [LineString (directed)]
roads = collections.defaultdict(list)        # key -> [LineString]
roadinfo = {}
rail_nodes = set(); xing = {}                # crossing node id -> point
xing_road = {}                               # node id -> road name/ref
road_nodes = collections.defaultdict(list)   # node id -> [(roadid, cls)] for kreuzung
node_loc = {}
rivers = collections.defaultdict(list)       # name -> [LineString]
streams = collections.defaultdict(list)
bridges = []; tunnels = []
roundabouts = []
kellerg = collections.defaultdict(list)
cyc_geom = {}
trails = collections.defaultdict(list)
ferrata = collections.defaultdict(list)
milestones = []    # (point, km, ref)
junctions = []     # (point, ref, name)
hunting = []; wind = []; masts = []; climb = []; peaks = []; bio_nodes = []
TRACK_CELL = 3000.0
track_best = {}   # cell -> (dist to centre, point, kind)
def track_sample(ls, kind):
    L = ls.length
    if L < 50: return
    n = max(1, int(L // 300))
    for k in range(n):
        p = ls.interpolate((k + 0.5) * L / n)
        cell = (int(p.x // TRACK_CELL), int(p.y // TRACK_CELL))
        cx, cy = (cell[0] + 0.5) * TRACK_CELL, (cell[1] + 0.5) * TRACK_CELL
        d = math.hypot(p.x - cx, p.y - cy)
        key = (cell, kind)
        if key not in track_best or d < track_best[key][0]:
            track_best[key] = (d, p)

# area grids
GRIDS = {'wald': 2000.0, 'weinberg': 1000.0, 'feld': 3000.0}
MINAREA = {'wald': 50000.0, 'weinberg': 10000.0, 'feld': 100000.0}
grid_best = {k: {} for k in GRIDS}
named_forest = []
builtup = []
forest_polys_for_tracks = []   # we test track points against forests at the end via STRtree of points
lakes = []
bio_areas = []
def grid_area(kind, g, name):
    size = GRIDS[kind]
    minx, miny, maxx, maxy = g.bounds
    pg = None
    for i in range(int(minx // size), int(maxx // size) + 1):
        for j in range(int(miny // size), int(maxy // size) + 1):
            cb = box(i * size, j * size, (i + 1) * size, (j + 1) * size)
            if pg is None: pg = prep(g)
            if pg.contains(cb):
                inter_a = size * size; p = cb.centroid
            else:
                if not pg.intersects(cb): continue
                inter = g.intersection(cb)
                inter_a = inter.area
                if inter_a < MINAREA[kind] * 0.2: continue
                p = inter.representative_point()
            cur = grid_best[kind].get((i, j))
            if cur is None or inter_a > cur[0]:
                grid_best[kind][(i, j)] = (inter_a, p, name)

def is_active_rail(tg):
    return tg.get('railway') in ACTIVE_RAIL and tg.get('usage') != 'military' and not tg.get('disused') and not tg.get('abandoned')

AREA_KEYS = osmium.filter.KeyFilter('landuse', 'natural', 'power', 'generator:source', 'plant:source')
fp = (osmium.FileProcessor(ARGS.pbf).with_locations().with_areas(AREA_KEYS))
nn = nw = na = 0
for o in fp:
    if o.is_node():
        tg = o.tags
        if not len(tg): continue
        nn += 1
        loc = o.location
        rw = tg.get('railway')
        if rw in ('level_crossing', 'crossing'):
            xing[o.id] = proj(Point(loc.lon, loc.lat))
        h = tg.get('highway')
        if h == 'milestone' or rw == 'milestone':
            pass
        if h == 'milestone' and tg.get('distance'):
            try: milestones.append((proj(Point(loc.lon, loc.lat)), float(tg['distance'].replace(',', '.').split()[0]), tg.get('ref', '')))
            except ValueError: pass
        if h == 'motorway_junction':
            junctions.append((proj(Point(loc.lon, loc.lat)), tg.get('ref', ''), tg.get('name', '')))
        if tg.get('amenity') == 'hunting_stand': hunting.append(proj(Point(loc.lon, loc.lat)))
        if tg.get('generator:source') == 'wind' or (tg.get('power') == 'generator' and tg.get('generator:method') == 'wind_turbine'):
            wind.append((proj(Point(loc.lon, loc.lat)), tg.get('name') or tg.get('ref') or '', tg.get('operator', '')))
        if tg.get('man_made') in ('mast', 'tower') and tg.get('tower:type') == 'communication':
            hgt = None
            try: hgt = float(re.match(r'[\d.]+', tg.get('height', '')).group(0))
            except Exception: pass
            if hgt is None or hgt >= 30:
                masts.append((proj(Point(loc.lon, loc.lat)), tg.get('name') or tg.get('operator') or '', hgt))
        if tg.get('sport') == 'climbing' and tg.get('leisure') not in ('sports_centre', 'sports_hall', 'fitness_centre') and not tg.get('building') and tg.get('climbing') not in ('boulder_wall', 'indoor') and tg.get('indoor') != 'yes':
            climb.append((proj(Point(loc.lon, loc.lat)), tg.get('name', ''), tg.get('climbing', ''), tg.get('natural', '')))
        if tg.get('natural') == 'peak' and tg.get('name'):
            peaks.append((proj(Point(loc.lon, loc.lat)), tg['name'], tg.get('ele', '')))
        if tg.get('power') in ('plant', 'generator') and re.search(r'biogas|biomass|biofuel', tg.get('plant:source', '') + tg.get('generator:source', '')):
            bio_nodes.append((proj(Point(loc.lon, loc.lat)), tg.get('name', ''), tg.get('power')))
        if tg.get('place') and re.search(r'kellergasse|kellertrift|kellerberg|kellerviertel', tg.get('name', ''), re.I):
            kellerg[tg['name']].append(proj(Point(loc.lon, loc.lat)))
    elif o.is_way():
        tg = o.tags
        if not len(tg): continue
        h = tg.get('highway'); rw = tg.get('railway'); ww = tg.get('waterway')
        nme = tg.get('name', '')
        interesting = h or rw or ww or (o.id in cyc_way) or (o.id in ferrata_way)
        if not interesting: continue
        nw += 1
        try:
            ls = line_of(o)
        except Exception:
            continue
        refs = tg.get('ref', '')
        # level crossings: membership
        if rw and is_active_rail(tg) and tg.get('service') not in ('yard',):
            for n in o.nodes:
                if n.ref in xing: rail_nodes.add(n.ref)
        if h:
            for n in o.nodes:
                if n.ref in xing and n.ref not in xing_road and (refs or nme):
                    xing_road[n.ref] = refs.split(';')[0] if refs else nme
        if h == 'motorway':
            m = re.search(r'\b([AS]\d+)\b', refs)
            if m: motorway[m.group(1)].append(ls)
        if h in ROADCLS and h != 'motorway' and (h != 'unclassified' or nme or refs):
            key = refs.split(';')[0] if refs else nme
            if key:
                roads[(h if h != 'trunk' else 'trunk', key)].append(ls)
        if h in ('trunk', 'primary', 'secondary') and tg.get('junction') != 'roundabout':
            rid = refs.split(';')[0] if refs else (nme or 'w%d' % o.id)
            for n in o.nodes:
                road_nodes[n.ref].append((rid, ROADCLS[h]))
                if n.ref not in node_loc: node_loc[n.ref] = (n.lon, n.lat)
        if tg.get('junction') in ('roundabout', 'circular') and h in ('trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'):
            roundabouts.append((ls, nme or refs, set(n.ref for n in o.nodes)))
        if h == 'track' or (h == 'service' and tg.get('service') not in ('parking_aisle', 'driveway', 'drive-through', 'alley')):
            if tg.get('access') not in ('private', 'no'):
                track_sample(ls, 'track' if h == 'track' else 'service')
        if h in ('path', 'footway', 'track') and tg.get('sac_scale') in ('mountain_hiking', 'demanding_mountain_hiking', 'alpine_hiking', 'demanding_alpine_hiking', 'difficult_alpine_hiking'):
            trails[(nme or tg.get('sac_scale'))].append(ls)
        if h == 'via_ferrata' or o.id in ferrata_way:
            ferrata[nme or ferrata_way.get(o.id) or 'Klettersteig'].append(ls)
        if ww == 'river' and nme:
            rivers[nme].append(ls)
        elif ww in ('stream', 'canal') and nme:
            streams[nme].append(ls)
        if (h or (rw and is_active_rail(tg))) and tg.get('bridge') in ('yes', 'viaduct', 'cantilever', 'beam', 'suspension', 'arch', 'covered') and h not in ('footway', 'steps', 'path', 'cycleway', 'bridleway', 'corridor', 'pedestrian', 'proposed', 'construction', 'platform'):
            bridges.append((ls, tg.get('bridge:name') or (nme if re.search(r'brücke|steg|viadukt', nme, re.I) else ''), refs.split(';')[0] if refs else nme, o.nodes[0].ref, o.nodes[-1].ref, 'rail' if rw else 'road'))
        if (h or (rw and is_active_rail(tg))) and tg.get('tunnel') in ('yes', 'building_passage') and tg.get('tunnel') != 'culvert' and h not in ('footway', 'steps', 'path', 'cycleway', 'corridor', 'proposed', 'construction', 'platform', 'service') and not ww:
            if tg.get('tunnel') == 'yes':
                tunnels.append((ls, tg.get('tunnel:name') or (nme if re.search(r'tunnel', nme, re.I) else ''), refs.split(';')[0] if refs else nme, o.nodes[0].ref, o.nodes[-1].ref))
        if h and re.search(r'kellergasse|kellertrift|kellerberg|kellerviertel', nme, re.I):
            kellerg[nme].append(ls)
        if o.id in cyc_way:
            cyc_geom[o.id] = ls
    elif o.is_area():
        tg = o.tags
        lu = tg.get('landuse'); nat = tg.get('natural')
        kind = None
        if lu == 'forest' or nat == 'wood': kind = 'wald'
        elif lu == 'vineyard': kind = 'weinberg'
        elif lu == 'farmland': kind = 'feld'
        bu = lu in ('residential', 'retail', 'industrial', 'commercial')
        lake = nat == 'water' and tg.get('name') and tg.get('water') in (None, 'lake', 'reservoir', 'pond', 'oxbow', 'lagoon', 'basin') and tg.get('water') != 'river'
        bio = tg.get('power') in ('plant', 'generator') and re.search(r'biogas|biomass|biofuel', tg.get('plant:source', '') + tg.get('generator:source', ''))
        if not (kind or bu or lake or bio): continue
        na += 1
        try:
            g = proj(swkb.loads(wkbf.create_multipolygon(o), hex=True))
        except Exception:
            continue
        if not g.is_valid: g = g.buffer(0)
        if kind:
            grid_area(kind, g, tg.get('name', ''))
            if kind == 'wald':
                forest_polys_for_tracks.append(g)
                if tg.get('name') and g.area > 200000: named_forest.append((tg['name'], g))
        if bu: builtup.append(g)
        if lake and g.area >= 30000: lakes.append((tg['name'], g))
        if bio: bio_areas.append((g, tg.get('name', '')))
log('pass1 nodes', nn, 'ways', nw, 'areas', na)

# ------------------------------------------------------------------ helpers
BU = STRtree(builtup) if builtup else None
def built_up(p):
    if BU is not None and any(builtup[i].contains(p) for i in BU.query(p)): return True
    return near_village(p, 250)

def sample_line(ls, step, offset=None):
    L = ls.length
    if offset is None: offset = step / 2
    s = offset
    while s < L:
        yield s, ls.interpolate(s)
        s += step

def merged(lines, directed=False):
    m = shapely.line_merge(shapely.MultiLineString([l for l in lines if l.length > 0]), directed=directed) if lines else None
    if m is None or m.is_empty: return []
    return list(m.geoms) if m.geom_type == 'MultiLineString' else [m]

# ------------------------------------------------------------------ autobahn
TERMINALS = {
    'A1': [('Salzburg', 47.80, 13.04), ('Wien', 48.20, 16.37)],
    'A2': [('Graz', 47.07, 15.44), ('Wien', 48.20, 16.37)],
    'A3': [('Eisenstadt', 47.85, 16.52), ('Wien', 48.20, 16.37)],
    'A4': [('Budapest', 47.50, 19.04), ('Wien', 48.20, 16.37)],
    'A5': [('Brünn', 49.19, 16.61), ('Wien', 48.20, 16.37)],
    'A6': [('Bratislava', 48.14, 17.10), ('Wien', 48.20, 16.37)],
    'A21': [('Linz', 48.30, 14.29), ('Wien', 48.20, 16.37)],
    'A22': [('Stockerau', 48.38, 16.21), ('Wien', 48.20, 16.37)],
    'S1': [('Vösendorf', 48.12, 16.33), ('Schwechat', 48.14, 16.48), ('Süßenbrunn', 48.28, 16.50)],
    'S2': [('Wien', 48.20, 16.37)],
    'S3': [('Hollabrunn', 48.56, 16.08), ('Wien', 48.20, 16.37)],
    'S4': [('Mattersburg', 47.74, 16.40), ('Wiener Neustadt', 47.81, 16.24)],
    'S5': [('Krems', 48.41, 15.60), ('Wien', 48.20, 16.37)],
    'S6': [('Graz', 47.07, 15.44), ('Wien', 48.20, 16.37)],
    'S8': [('Marchegg', 48.28, 16.91), ('Wien', 48.20, 16.37)],
    'S31': [('Eisenstadt', 47.85, 16.52), ('Oberpullendorf', 47.50, 16.50)],
    'S33': [('St. Pölten', 48.20, 15.62), ('Krems', 48.41, 15.60)],
}
def richtung(ref, comp):
    a = Point(comp.coords[0]); b = Point(comp.coords[-1])
    vx, vy = b.x - a.x, b.y - a.y
    vl = math.hypot(vx, vy) or 1
    terms = TERMINALS.get(ref)
    if terms:
        best = None
        for nm, la, lo in terms:
            tx, ty = lo * KX - a.x, la * KY - a.y
            c = (vx * tx + vy * ty) / (vl * (math.hypot(tx, ty) or 1))
            if best is None or c > best[0]: best = (c, nm)
        return best[1]
    # fallback: nearest town/city to the far end
    c = [(BIGPL[i], BIGPL[i][2].distance(b)) for i in BIGPT.query(b.buffer(10000)) if BIGPL[i][1] == 3]
    return min(c, key=lambda x: x[1])[0][0] if c else ''

markers = collections.defaultdict(list)   # ref -> [(point, km)]
for p, ref, nm in junctions:
    m = re.match(r'^\s*(\d+(?:[.,]\d+)?)\s*$', ref or '')
    if m: markers['*'].append((p, float(m.group(1).replace(',', '.'))))
for p, km, ref in milestones:
    markers[ref or '*'].append((p, km))
n_auto = 0; km_set = 0
for ref, lines in motorway.items():
    comps = merged(lines, directed=True)
    allm = markers.get(ref, []) + markers['*']
    for comp in comps:
        if comp.length < 300: continue
        # markers on this carriageway
        on = sorted([(comp.project(p), km) for p, km in allm if comp.distance(p) < 120], key=lambda x: x[0])
        sign = 0
        if len(on) >= 2:
            ds = sum((on[i + 1][1] - on[i][1]) for i in range(len(on) - 1))
            sign = 1 if ds > 0 else -1
            # drop outliers (e.g. exit numbers of a crossing motorway): offset km - sign*s must be consistent
            offs = sorted(km - sign * s_ / 1000.0 for s_, km in on)
            med = offs[len(offs) // 2]
            on = [(s_, km) for s_, km in on if abs(km - sign * s_ / 1000.0 - med) <= 5.0]
            if len(on) < 2: sign = 0
        rich = richtung(ref, comp)
        for s, p in sample_line(comp, 500.0, 250.0):
            if not NOEP.contains(p): continue
            km = ''
            if on and sign:
                before = [x for x in on if x[0] <= s]; after = [x for x in on if x[0] > s]
                if before and after:
                    (s0, k0), (s1, k1) = before[-1], after[0]
                    km = '%.1f' % (k0 + (k1 - k0) * (s - s0) / ((s1 - s0) or 1))
                else:
                    s0, k0 = min(on, key=lambda x: abs(x[0] - s))
                    if abs(s - s0) <= 3000:
                        km = '%.1f' % (k0 + sign * (s - s0) / 1000.0)
            if km: km_set += 1
            add('autobahn', p, ref, km + '|' + rich); n_auto += 1
log('autobahn', n_auto, 'with km', km_set)

# ------------------------------------------------------------------ landstrasse
def places_along(comp):
    res = []
    for i in BIGPT.query(comp.buffer(400)):
        nm, rk, pp = BIGPL[i]
        if comp.distance(pp) <= 400: res.append((comp.project(pp), nm))
    return sorted(res)
n_land = 0
for (cls, key), lines in roads.items():
    for comp in merged(lines):
        if comp.length < 500: continue
        pl = places_along(comp)
        for s, p in sample_line(comp, 1000.0):
            if not NOEP.contains(p) or built_up(p): continue
            before = [x for x in pl if x[0] < s]; after = [x for x in pl if x[0] > s]
            info = ''
            if before and after and before[-1][1] != after[0][1]:
                info = 'zwischen %s und %s' % (before[-1][1], after[0][1])
            add('landstrasse', p, key, info); n_land += 1
log('landstrasse', n_land)

# ------------------------------------------------------------------ feldweg (tracks + forest service roads)
tb = [(k[0], k[1], v[1]) for k, v in track_best.items()]
pts = [x[2] for x in tb]
in_forest = [False] * len(pts)
if pts:
    PTT = STRtree(pts)
    for g in forest_polys_for_tracks:
        pg = None
        for i in PTT.query(g):
            if not in_forest[i]:
                if pg is None: pg = prep(g)
                if pg.contains(pts[i]): in_forest[i] = True
cells = {}
for (cell, kind, p), f in zip(tb, in_forest):
    if kind == 'service' and not f: continue
    if not NOEP.contains(p): continue
    cur = cells.get(cell)
    pri = (1 if kind == 'track' else 0)
    if cur is None or pri > cur[0]:
        cells[cell] = (pri, p, f)
for cell, (pri, p, f) in cells.items():
    add('feldweg', p, '', 'Forststraße' if f else 'Feldweg')
log('feldweg', len(cells))

# ------------------------------------------------------------------ radweg
NETPRI = {'ncn': 0, 'rcn': 1, 'icn': 2, 'lcn': 3}   # national/regional names (Donauradweg) before EuroVelo
rad_pts = []
for rid, (nm, net) in sorted(cyc_rel.items(), key=lambda x: NETPRI[x[1][1]]):
    lines = [cyc_geom[w] for w, rs in cyc_way.items() if rid in rs and w in cyc_geom]
    for comp in merged(lines):
        for s, p in sample_line(comp, 1000.0):
            if NOEP.contains(p): rad_pts.append((p, nm, net))
# drop points within 400 m of an already kept point (shared sections)
kept = []
for p, nm, net in rad_pts:
    if kept:
        tr = None
    kept.append((p, nm, net))
grid = {}
final_rad = []
for p, nm, net in rad_pts:
    c = (int(p.x // 400), int(p.y // 400))
    if any((c[0] + dx, c[1] + dy) in grid and grid[(c[0] + dx, c[1] + dy)].distance(p) < 400 for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
        continue
    grid[c] = p
    final_rad.append((p, nm, net))
def clean_route(nm):
    nm = re.sub(r'\s*\[[^\]]*\]', '', nm)
    nm = re.sub(r'_\d+\b.*$', '', nm)
    return re.sub(r'[\s\-–]+$', '', nm.replace('|', '/')).strip()
for p, nm, net in final_rad: add('radweg', p, clean_route(nm), net)
log('radweg', len(final_rad), 'of', len(rad_pts))

# ------------------------------------------------------------------ wald / weinberg / feld
NF = STRtree([g for _, g in named_forest]) if named_forest else None
for kind in ('wald', 'weinberg', 'feld'):
    n = 0
    for cell, (a, p, nm) in grid_best[kind].items():
        if a < MINAREA[kind] or not NOEP.contains(p): continue
        if kind == 'wald' and not nm and NF is not None:
            hits = [named_forest[i] for i in NF.query(p) if named_forest[i][1].contains(p)]
            if hits: nm = max(hits, key=lambda x: x[1].area)[0]
        add(kind, p, nm or ('Wald' if kind == 'wald' else ''), '')
        n += 1
    log(kind, n)

# ------------------------------------------------------------------ berg
for p, nm, ele in peaks:
    if NOEP.contains(p):
        e = re.match(r'[\d.,]+', ele or '')
        add('berg', p, nm, ('%d m' % round(float(e.group(0).replace(',', '.')))) if e else '')
nh = 0
for r in C['recs']:
    t = r['tags']
    if t.get('tourism') in ('alpine_hut', 'wilderness_hut') and t.get('name'):
        g = proj(r['g']); p = g if g.geom_type == 'Point' else g.representative_point()
        if NOEP.contains(p): add('berg', p, t['name'], 'Hütte'); nh += 1
nt = 0
for nm, lines in trails.items():
    for comp in merged(lines):
        for s, p in sample_line(comp, 1000.0):
            if NOEP.contains(p):
                add('berg', p, nm if not nm.endswith('hiking') else 'Bergweg', 'Bergweg'); nt += 1
log('berg peaks', len(peaks), 'huts', nh, 'trail points', nt)

# ------------------------------------------------------------------ ufer
nu = 0
for coll, minlen in ((rivers, 0), (streams, 8000)):
    for nm, lines in coll.items():
        for comp in merged(lines):
            if comp.length < max(minlen, 1000): continue
            for s, p in sample_line(comp, 1000.0):
                if NOEP.contains(p): add('ufer', p, nm, 'Fluss' if coll is rivers else 'Bach'); nu += 1
for nm, g in lakes:
    polys = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
    for pg in polys:
        ring = pg.exterior
        if ring.length < 500:
            p = ring.interpolate(0);
            if NOEP.contains(p): add('ufer', p, nm, 'See'); nu += 1
            continue
        for s, p in sample_line(ring, 500.0, 0.0):
            if NOEP.contains(p): add('ufer', p, nm, 'See'); nu += 1
log('ufer', nu)

# ------------------------------------------------------------------ bahnuebergang
bx = []
for nid in rail_nodes:
    p = xing[nid]
    if not NOEP.contains(p): continue
    if any(q.distance(p) < 50 for q in bx[-50:]): pass
    bx.append(p)
seen = {}
nbx = 0
for nid in rail_nodes:
    p = xing[nid]
    if not NOEP.contains(p): continue
    c = (int(p.x // 50), int(p.y // 50))
    if any((c[0] + dx, c[1] + dy) in seen and seen[(c[0] + dx, c[1] + dy)].distance(p) < 50 for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
        continue
    seen[c] = p
    add('bahnuebergang', p, xing_road.get(nid, ''), ''); nbx += 1
log('bahnuebergang', nbx)

# ------------------------------------------------------------------ bruecke / tunnel (group connected segments of the same road)
def group_segments(items, key_idx):
    par = list(range(len(items)))
    def f(x):
        while par[x] != x:
            par[x] = par[par[x]]; x = par[x]
        return x
    ends = collections.defaultdict(list)
    for i, it in enumerate(items):
        ends[(it[key_idx], it[3])].append(i); ends[(it[key_idx], it[4])].append(i)
    for lst in ends.values():
        for j in lst[1:]:
            a, b = f(lst[0]), f(j)
            if a != b: par[b] = a
    gr = collections.defaultdict(list)
    for i in range(len(items)): gr[f(i)].append(items[i])
    return list(gr.values())
riv_lines = [(nm, l) for nm, ls_ in rivers.items() for l in ls_]
RVT = STRtree([l for _, l in riv_lines]) if riv_lines else None
br_pts = []
for grp in group_segments(bridges, 2):
    geom = unary_union([g[0] for g in grp])
    L = sum(g[0].length for g in grp)
    lm = merged([g[0] for g in grp]); main = max(lm, key=lambda x: x.length) if lm else grp[0][0]
    river = ''
    if RVT is not None:
        for i in RVT.query(geom):
            if riv_lines[i][1].intersects(geom): river = riv_lines[i][0]; break
    if not river and L < 50: continue
    p = main.interpolate(0.5, normalized=True)
    bname = next((g[1] for g in grp if g[1]), '')
    road = grp[0][2]
    if bname: name = bname
    elif river: name = ((road + ' über ') if road else 'Brücke über ') + ('den ' if False else '') + river
    else: name = road
    br_pts.append((p, name, river, L))
# dedupe parallel carriageways (same river/name within 80 m)
kept = []
BRT = None
for p, name, river, L in sorted(br_pts, key=lambda x: -x[3]):
    if any(q.distance(p) < 80 and (rv == river) for q, _, rv, _ in kept[-200:]): continue
    if not NOEP.contains(p): continue
    kept.append((p, name, river, L))
for p, name, river, L in kept:
    add('bruecke', p, name, ('%d m' % round(L)) + (' · ' + river if river else ''))
log('bruecke', len(kept))
nt_ = 0
tun_kept = []
for grp in group_segments(tunnels, 2):
    L = sum(g[0].length for g in grp)
    if L < 100: continue
    lm = merged([g[0] for g in grp]); main = max(lm, key=lambda x: x.length) if lm else grp[0][0]
    p = main.interpolate(0.5, normalized=True)
    if not NOEP.contains(p): continue
    nm = next((g[1] for g in grp if g[1]), '') or ((grp[0][2] + ' Tunnel') if grp[0][2] else 'Tunnel')
    if any(q.distance(p) < 150 for q, _ in tun_kept): continue
    tun_kept.append((p, nm))
    add('tunnel', p, nm, '%d m' % round(L)); nt_ += 1
log('tunnel', nt_)

# ------------------------------------------------------------------ anschlussstelle
na_ = 0
for p, ref, nm in junctions:
    if NOEP.contains(p):
        add('anschlussstelle', p, nm, ('Abfahrt ' + ref) if ref else ''); na_ += 1
log('anschlussstelle', na_)

# ------------------------------------------------------------------ kreisverkehr
par = list(range(len(roundabouts)))
def rf(x):
    while par[x] != x:
        par[x] = par[par[x]]; x = par[x]
    return x
nodeown = {}
for i, (ls, nm, nodes) in enumerate(roundabouts):
    for n in nodes:
        if n in nodeown:
            a, b = rf(nodeown[n]), rf(i)
            if a != b: par[b] = a
        else: nodeown[n] = i
grp = collections.defaultdict(list)
for i in range(len(roundabouts)): grp[rf(i)].append(roundabouts[i])
nk = 0
for g in grp.values():
    geom = unary_union([x[0] for x in g])
    p = geom.convex_hull.centroid
    if not NOEP.contains(p): continue
    nm = next((x[1] for x in g if x[1]), '')
    add('kreisverkehr', p, nm, ''); nk += 1
log('kreisverkehr', nk)

# ------------------------------------------------------------------ kreuzung
cand = []
for nid, lst in road_nodes.items():
    ids = {r for r, c in lst}
    if len(ids) < 2: continue
    p = proj(Point(*node_loc[nid]))
    if not NOEP.contains(p) or built_up(p): continue
    cls = sorted((c for r, c in lst), reverse=True)
    names = sorted(ids)
    cand.append((cls[0] + cls[1], p, ' / '.join(n for n in names if not n.startswith('w'))[:60]))
cand.sort(key=lambda x: -x[0])
kept = {}
outk = []
for pri, p, nm in cand:
    c = (int(p.x // 100), int(p.y // 100))
    if any((c[0] + dx, c[1] + dy) in kept and kept[(c[0] + dx, c[1] + dy)].distance(p) < 100 for dx in (-1, 0, 1) for dy in (-1, 0, 1)): continue
    kept[c] = p; outk.append((p, nm))
    if len(outk) >= 2000: break
for p, nm in outk: add('kreuzung', p, nm, '')
log('kreuzung', len(outk), 'of candidates', len(cand))

# ------------------------------------------------------------------ kellergasse
nkg = 0
for nm, geoms in kellerg.items():
    # cluster pieces of the same name within 1 km
    items = list(geoms)
    used = [False] * len(items)
    for i in range(len(items)):
        if used[i]: continue
        cl = [items[i]]; used[i] = True
        for j in range(i + 1, len(items)):
            if not used[j] and unary_union(cl).distance(items[j]) < 1000:
                cl.append(items[j]); used[j] = True
        u = unary_union(cl)
        c = u.centroid
        lines = [x for x in cl if x.geom_type != 'Point']
        p = shapely.ops.nearest_points(unary_union(lines), c)[0] if lines else c
        if NOEP.contains(p):
            nm2 = nm if not re.match(r'(?i)^(kellergasse|kellertrift|kellerberg|kellerviertel)$', nm.strip()) else nm.strip() + ' ' + ort(p)
            add('kellergasse', p, nm2, ''); nkg += 1
log('kellergasse', nkg)

# ------------------------------------------------------------------ hochstand (max 1 per ~2 km²)
HS = math.sqrt(2e6)
hs = {}
for p in hunting:
    if not NOEP.contains(p): continue
    c = (int(p.x // HS), int(p.y // HS))
    cx, cy = (c[0] + 0.5) * HS, (c[1] + 0.5) * HS
    d = math.hypot(p.x - cx, p.y - cy)
    if c not in hs or d < hs[c][0]: hs[c] = (d, p)
for d, p in hs.values(): add('hochstand', p, '', '')
log('hochstand', len(hs), 'of', len(hunting))

# ------------------------------------------------------------------ windrad
wind_in = [w for w in wind if NOEP.contains(w[0])]
if len(wind_in) > 1500:
    log('windrad thinning to parks')
for p, nm, op in wind_in: add('windrad', p, nm, op)
log('windrad', len(wind_in))

# ------------------------------------------------------------------ sendemast
nm_ = 0
for p, nm, hgt in masts:
    if NOEP.contains(p): add('sendemast', p, nm, ('%d m' % hgt) if hgt else ''); nm_ += 1
log('sendemast', nm_)

# ------------------------------------------------------------------ biogasanlage
bio_kept = []
for g, nm in bio_areas:
    if nm or g.area >= 3000:
        p = g.representative_point()
        if NOEP.contains(p) and not any(q.distance(p) < 200 for q, _ in bio_kept):
            bio_kept.append((p, nm))
for p, nm, pw in bio_nodes:
    if not NOEP.contains(p) or any(q.distance(p) < 200 for q, _ in bio_kept): continue
    if nm or pw == 'plant': bio_kept.append((p, nm))
for p, nm in bio_kept: add('biogasanlage', p, nm, '')
log('biogasanlage', len(bio_kept))

# ------------------------------------------------------------------ kletterfels / klettersteig
crags = sorted(climb, key=lambda x: (0 if x[2] in ('crag', 'area') else 1, 0 if x[1] else 1))
ck = []
for p, nm, cl, nat in crags:
    if not NOEP.contains(p): continue
    if any(q.distance(p) < 300 for q, _ in ck): continue
    ck.append((p, nm))
for p, nm in ck: add('kletterfels', p, nm, '')
log('kletterfels', len(ck))
nf = 0
for nm, lines in ferrata.items():
    for comp in merged(lines):
        if comp.length < 30: continue
        p = Point(comp.coords[0])
        if NOEP.contains(p): add('klettersteig', p, nm, '%d m' % round(comp.length)); nf += 1
log('klettersteig', nf)

# ------------------------------------------------------------------ output
log('total raw rows', len(ROWS))
NOELLP = prep(NOE_LL); n_out = 0
seen = set(); out = []
for typ, x, y, nm, info in ROWS:
    la, lo = unproj_xy(x, y)
    key = (typ, '%.5f' % la, '%.5f' % lo)
    if key in seen: continue
    if not NOELLP.contains(Point(round(lo, 5), round(la, 5))):
        n_out += 1; continue
    seen.add(key)
    out.append((typ, la, lo, nm, info))
log('after exact-dup removal / rounding outside NÖ', len(out), n_out)
cnt = collections.Counter(r[0] for r in out)
if len(out) > ARGS.max_rows:
    log('WARNING: more rows than --max-rows; thin spacings')
ORTCACHE = {}
with open(ARGS.out, 'w', encoding='utf-8', newline='') as fo:
    fo.write('typ;breitengrad;laengengrad;name;ort;info\n')
    for typ, la, lo, nm, info in out:
        p = Point(lo * KX, la * KY)
        o_ = ort(p)
        vals = [typ, '%.5f' % la, '%.5f' % lo, nm, o_, info]
        fo.write(';'.join(v.replace(';', ',').replace('\n', ' ').replace('"', "'") for v in vals) + '\n')
for k, v in sorted(cnt.items()): print(f'{k:16s}{v}')
log('written', len(out))
