"""Classify, place, name and dedupe POI candidates into the LeitWerk POI CSV.

Usage: python3 -I build.py CAND_PKL BASE_CSV OUT_CSV [--debug-dir DIR] [--no-unnamed-edu]
  CAND_PKL   output of extract.py
  BASE_CSV   previous POI file; its checked 'Pflegeheim' rows are kept as base list
  OUT_CSV    file to write
  --debug-dir  optional folder for merges.txt and final.pkl
  --no-unnamed-edu  do not add unnamed kindergartens/schools (v2 behaviour)
"""
import sys, os, re, csv, math, pickle, difflib, collections, unicodedata, argparse
from shapely.geometry import Point
from shapely.strtree import STRtree
from shapely.ops import unary_union

ap = argparse.ArgumentParser()
ap.add_argument('cand'); ap.add_argument('base_csv'); ap.add_argument('out_csv')
ap.add_argument('--debug-dir'); ap.add_argument('--no-unnamed-edu', action='store_true')
ARGS = ap.parse_args()
d = pickle.load(open(ARGS.cand, 'rb'))
RECS, ADMIN = d['recs'], d['admin']
OLD = ARGS.base_csv
OUT = ARGS.out_csv
UNNAMED_EDU = not ARGS.no_unnamed_edu

KX, KY = 74100.0, 111200.0  # metres per degree lon/lat at ~48.3N
def m(p): return (p.x * KX, p.y * KY)
def dist(a, b): return math.hypot((a.x - b.x) * KX, (a.y - b.y) * KY)
def area_m2(g): return g.area * KX * KY if g.geom_type != 'Point' else 0.0

# ---------------------------------------------------------------- boundaries
noe = [a for a in ADMIN if a['tags'].get('admin_level') == '4' and a['id'] == 77189][0]['g']
NOE = noe.buffer(0)
from shapely.prepared import prep
NOEP = prep(NOE)
gem = []
for a in ADMIN:
    if a['tags'].get('admin_level') == '8':
        g = a['g'].buffer(0)
        if NOEP.contains(g.representative_point()):
            gem.append((a['tags'].get('name'), g))
bez = []
for a in ADMIN:
    if a['tags'].get('admin_level') == '6':
        g = a['g'].buffer(0)
        if NOEP.contains(g.representative_point()):
            bez.append((a['tags'].get('name'), g))
GT = STRtree([g for _, g in gem]); BT = STRtree([g for _, g in bez])
def lookup(tree, lst, p):
    for i in tree.query(p):
        if lst[i][1].contains(p):
            return lst[i][0]
    return None
def gemeinde(p):
    n = lookup(GT, gem, p)
    if n is None:  # Statutarstadt without level-8 relation
        n = lookup(BT, bez, p)
        if n and n.startswith('Bezirk '): n = None
    return n
def bezirk(p):
    n = lookup(BT, bez, p)
    if n and not n.startswith('Bezirk '): n = n + ' (Stadt)'
    return n

# ---------------------------------------------------------------- helper layers
places, parkings, gates, aerial = [], [], [], []
for r in RECS:
    t = r['tags']
    if t.get('place') in ('city', 'town', 'village', 'suburb', 'hamlet', 'quarter', 'neighbourhood') and r['t'] == 'n' and t.get('name'):
        places.append((t['name'], t['place'], r['g']))
    if t.get('amenity') == 'parking' and t.get('access') not in ('private', 'no', 'customers_private'):
        parkings.append((r['g'].centroid if r['t'] != 'n' else r['g'], area_m2(r['g'])))
    if r['t'] == 'n' and (t.get('barrier') == 'gate' or t.get('entrance') in ('main', 'yes', 'service')):
        gates.append(r['g'])
    if t.get('aerialway') == 'station':
        aerial.append(r['g'] if r['t'] == 'n' else r['g'].centroid)
PT = STRtree([p[2] for p in places])
PKT = STRtree([p[0] for p in parkings])
GTT = STRtree(gates) if gates else None

def locality(p, t):
    if t.get('addr:place'): return t['addr:place']
    best = None
    for i in PT.query(p.buffer(0.04)):
        nm, pl, g = places[i]
        dd = dist(p, g)
        lim = {'city': 4000, 'town': 3000, 'village': 2500, 'suburb': 1500, 'quarter': 1200, 'neighbourhood': 800, 'hamlet': 800}[pl]
        if dd > lim: continue
        score = dd * (0.5 if pl in ('city', 'town') else 1.0) * (1.6 if pl in ('hamlet', 'neighbourhood') else 1.0)
        if best is None or score < best[0]: best = (score, nm)
    return best[1] if best else None

# ---------------------------------------------------------------- text helpers
def fold(s):
    s = s.lower().replace('ß', 'ss')
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return ' '.join(s.split())

def has(n, pat): return re.search(pat, n, re.I) is not None

GENERIC = set(fold("""volksschule vs mittelschule ms nms nnoms neue polytechnische schule pts ps sonderschule aso
kindergarten landeskindergarten kiga noe no landes kinderkrippe krippe krabbelstube tagesbetreuung tagesbetreuungseinrichtung tbe
kleinkindbetreuung kleinkindgruppe betreuungseinrichtung hort sportplatz fussballplatz fussballfeld sportanlage sportzentrum stadion
freibad hallenbad strandbad schwimmbad bad badesee badeteich tennisplatz tennisplatze tennisanlage tennis tennisclub tc tennishalle
turnhalle sporthalle mehrzweckhalle halle reitstall reitplatz reithalle reitanlage reitverein reiterhof campingplatz camping
museum heuriger buschenschank heurigen seniorenheim pflegeheim betreutes betreubares wohnen haus pflegezentrum
ordination praxis arztpraxis gemeinschaftspraxis allgemeinmedizin kletterhalle eislaufplatz eisplatz eishalle kunsteisbahn
stadtsaal festsaal veranstaltungssaal veranstaltungszentrum kulturhaus kulturzentrum gemeindesaal pfarrsaal saal volksheim
kino golfplatz golfclub minigolf fitnessstudio fitness studio gym motocross kartbahn steinbruch sagewerk sage lagerhaus
kraftwerk wasserkraftwerk flugplatz landeplatz hubschrauberlandeplatz heliport sportverein sv sc usv fc
billa plus spar eurospar interspar hofer lidl penny unimarkt mpreis adeg nah frisch merkur obi hornbach bauhaus hagebau
xxxlutz lutz moebelix mobelix kika leiner momax ikea baumax baumarkt supermarkt markt rwa raiffeisen bau garten
bauernmuseum heimatmuseum dorfmuseum stadtmuseum ortsmuseum heimathaus feuerwehrmuseum handelsakademie handelsschule gymnasium htl hak has bhak bhas hlw borg brg bg landespflegeheim seniorenhaus seniorenresidenz pflegeheim pensionistenheim naturbadeplatz badeplatz ruderbootverleih bootsverleih ost sud west nord slipstelle anlegestelle schiffsanlegestelle schiffsstation feuerwehrhafen bootssteg steg landesteg umsetzanlage sportboote boote boot fur hafen yachthafen jachthafen sporthafen bootshafen marina fahre rollfahre faehre busbahnhof busterminal autobusbahnhof hauptbahnhof bahnhof streichelzoo tierpark wildpark biogasanlage heizwerk fernheizwerk biomasse biomasseheizwerk seniorenwohnheim gemeindezentrum seminarhotel caritas gesundheitszentrum allgemeine kinderhaus landwirtschaftliche fachschule eishalle eissporthalle eislaufplatz squash boulder bouldern speedway motocross track hotel gasthof hort lebenshilfe werkstatte wohnhaus tagesstatte reithalle tennishalle stocksportanlage freizeitzentrum festhalle mehrzweckhalle kunsteisbahn turnsaal sportheim fussball fussballverein sportunion union tennisverein kinderbetreuung spielgruppe kino theater pfarrsaal klettergarten hochseilgarten windpark solarpark photovoltaikanlage wasserkraftwerk kleinwasserkraftwerk silo getreidesilo lagerhausturm raiffeisenlagerhaus raiffeisen-lagerhaus schloss burg ruine burgruine aussichtswarte warte aussichtsturm i ii iii iv v vi 1 2 3 4 5 6 7 8 9 der die das des und am an im in bei zum zur"""
.replace('\n', ' ')).split())

def is_generic(name):
    toks = fold(name).split()
    rest = [x for x in toks if x not in GENERIC]
    return len(rest) == 0

CLOSED = re.compile(r'\b(ehemalig\w*|ehem\.|geschlossen|stillgelegt|aufgelassen|closed|former|disused|abgerissen|leerstehend)\b', re.I)

# ---------------------------------------------------------------- classification
CHAIN_SM = r'billa|spar|hofer|lidl|penny|unimarkt|mpreis|m-preis|merkur|adeg|nah ?& ?frisch|nah und frisch|interspar|eurospar|maximarkt|norma'
BIG_DIY = r'\bobi\b|hornbach|bauhaus|hagebau|lagerhaus|bauwelt|baumarkt|quester|bau ?& ?garten|holzbau|baustoff'
FURN = r'xxxl|lutz|m(o|ö|oe)belix|kika|leiner|m(ö|o|oe)max|ikea|möbelstadt|mobelstadt|einrichtungshaus|sconto'

def sports(t):
    return set(re.split(r'[;,]\s*', t.get('sport', ''))) - {''}

def is_pool(t):
    """pool-type bathing facility (never badesee)"""
    if is_open_water(t): return False
    return t.get('leisure') in ('swimming_pool', 'water_park') or t.get('amenity') in ('public_bath', 'swimming_pool') \
        or (t.get('leisure') == 'sports_centre' and 'swimming' in sports(t)) or ('water_park' in t) or t.get('spa') == 'therme'

def is_open_water(t):
    return t.get('leisure') in ('bathing_place', 'beach_resort', 'swimming_area') or t.get('natural') in ('water', 'beach') or 'water' in t \
        or t.get('water_park') in ('lake', 'natural', 'river', 'pond')

def is_bus(t):
    return t.get('highway') == 'bus_stop' or (t.get('public_transport') in ('platform', 'stop_position') and t.get('bus') == 'yes')

def classify(t, g, a):
    """return list of keys (most specific first)"""
    name = t.get('name', '')
    n = name
    am, le, sh, to = t.get('amenity'), t.get('leisure'), t.get('shop'), t.get('tourism')
    sf, hc = t.get('social_facility'), t.get('healthcare')
    sp = sports(t)
    K = []
    def add(*ks):
        for k in ks:
            if k not in K: K.append(k)

    # ---- Pflege & Betreuung
    sffor = t.get('social_facility:for', '')
    if am in ('nursing_home', 'social_facility') or sf or t.get('building') == 'nursing_home':
        pfl_name = has(n, r'pflege(heim|zentrum)|seniorenheim|seniorenwohnheim|seniorenzentrum|senioren-?residenz|altenheim|alten- und pflege|pensionistenheim|pflege- und betreuung|pflege-? ?und förder|senecura|senioren ?aktiv|haus der barmherzigkeit|pflegewohnhaus|landespflege')
        if (sf == 'assisted_living' and not pfl_name) or has(n, r'betreu(t|b)(es|tes)? ?wohnen|betreubares|betreutes|seniorenwohnung|seniorenwohnhaus|wohnen für senior|generationenwohnen'):
            add('betreutes_wohnen')
        if sf == 'assisted_living' and pfl_name and not has(n, r'pflege|heim'):
            add('betreutes_wohnen')
        elif am == 'nursing_home' or sf == 'nursing_home' or t.get('building') == 'nursing_home' or pfl_name:
            if has(n, r'sonderkrankenanstalt|rehabilitationszentrum|\bRZ\b|reha'):
                add('reha')
            elif not has(n, r'mobil|hauskrankenpflege|hilfswerk$|beratung|24 ?(stunden|h)|personenbetreuung|agentur'):
                add('pflegeheim')
        if (sf in ('group_home', 'workshop', 'day_care', 'supported_living', 'residential') and has(sffor, r'disab|mental|handicap')) or has(sf or '', r'disabled') \
           or (sffor and has(sffor, r'disab') ) \
           or has(n, r'lebenshilfe|jugend am werk|behindert|tageswerkst|werkstätte|caritas.*(wohnhaus|werkst|tagesst)|menschen mit (behinderung|beeinträchtigung)|sozialtherap|förderwerkst|beschäftigungstherap|tagesstätte für'):
            if not has(n, r'second ?hand|shop|laden|flohmarkt|carla|geschäftsstelle|büro|verwaltung|zentrale|beratung|ambulanz') and (sf != 'outreach' or has(n, r'werkstätte|wohnhaus|tagesstätte')):
                add('behinderteneinrichtung')

    # ---- Kinder & Bildung
    if am in ('kindergarten', 'childcare'):
        if has(n, r'krippe|krabbel|kleinkind|tagesbetreuung|tagesmutter|tagesmütter|tageseltern|babygruppe|spielgruppe') or (am == 'childcare' and not has(n, r'kindergarten|hort')):
            add('kinderkrippe')
        if am == 'kindergarten' or has(n, r'kindergarten|kiga'):
            if not has(n, r'^(kinder)?krippe|^krabbel'):
                add('kindergarten')
            elif has(n, r'kindergarten'):
                add('kindergarten')
        if has(n, r'\bhort\b|schülerhort|nachmittagsbetreuung') and not has(n, r'kindergarten|krippe|kiga'):
            K.clear()
    sch = am in ('school', 'college', 'university') or t.get('building') in ('school', 'university', 'college')
    if sch:
        isced = t.get('isced:level', '')
        if has(n, r'universit|fachhochschule|\bFH\b|pädagogische hochschule|\bPH\b|hochschule|donau-uni|institute of science|IST Austria|\bIMC\b|militärakademie|\bKPH\b|kirchliche pädagogische|konservatorium|privatuniversit|karl landsteiner|campus krems|bertha von suttner'):
            if not has(n, r'volkshochschule|musik|hochschülerschaft'):
                add('hochschule')
        if has(n, r'berufsschule|\bLBS\b'):
            add('berufsschule')
        hs = has(n, r'gymnasium|\bBG\b|\bBRG\b|\bBORG\b|\bORG\b|\bBG ?/ ?BRG|\bBRG ?/ ?BG|\bAHS\b|\bHAK\b|\bHAS\b|\bHTL\b|HTBLu?V?A|\bHLW\b|\bHBLA|\bHBLFA|\bHLT\b|handelsakademie|handelsschule|fachschule|höhere|bundesoberstufen|oberstufenreal|realgymnas|tourismusschule|\bLFS\b|landwirtschaftliche|forstfachschule|bildungsanstalt|\bBAfEP|\bBAKIP|kolleg\b|josephinum|wirtschaftsschule|\bHLM\b|\bHLA\b|tourismus|gartenbauschule|weinbauschule|\bHBLVA|\bFS\b|\bLLA\b|Sacré|Sacre Coeur|theresianum|stiftsgymn|militärrealgymnasium|sportgymnasium|schulzentrum.*(hak|htl|hlw)')
        if hs:
            add('hoehere_schule')
            if has(n, r'gymnasium|\bBG\b|\bBRG\b|\bAHS\b|realgymn') and not has(n, r'\bBORG\b|oberstufen|bundesoberstufen'):
                add('mittelschule')
        if has(n, r'sonderschule|\bASO\b|\bSPZ\b|sonderpädagog|heilstättenschule|\bSEZ\b|inklusive?s? ?(schulzentrum|bildung)|förderschule|integrative'):
            add('sonderschule')
        vs = has(n, r'volksschule|\bVS\b|grundschule|\bVS ?[a-zäöü]|volks- ?und|volks-')
        msn = has(n, r'mittelschule|\bNMS\b|\bNNÖMS|\bMS\b|hauptschule|\bHS\b|polytechn|\bPTS\b|\bPS\b|\bSMS\b|\bIMS\b|europaschule.*ms|\bMMS\b|musikmittelschule|sportmittelschule|mittel-')
        if vs: add('volksschule')
        if msn: add('mittelschule')
        if not K or (K == ['kinderkrippe'] or K == ['kindergarten']):
            if '1' in isced.split(';') and not K: add('volksschule')
            if '2' in isced.split(';') and 'mittelschule' not in K and 'hoehere_schule' not in K: add('mittelschule')
            if '3' in isced.split(';') and 'hoehere_schule' not in K and 'berufsschule' not in K: add('hoehere_schule')
        if am == 'university' and 'hochschule' not in K and not K: add('hochschule')
        if has(n, r'musikschule|fahrschule|tanzschule|volkshochschule|sprachschule|yoga|reitschule|skischule|surf|nachhilfe|kunstschule|malschule|ballett|schwimmschule|hundeschule|flugschule|krankenpflegeschule|gesundheits- und krankenpflege|schule für (allgemeine )?gesundheits'):
            for k in ('volksschule', 'mittelschule', 'hoehere_schule', 'hochschule'):
                if k in K and not has(n, r'volksschule|mittelschule|gymnasium'): K.remove(k)
            if has(n, r'krankenpflege|gesundheits- und krankenpflege'): add('hoehere_schule')

    # ---- Gesundheit
    if am in ('doctors', 'clinic', 'hospital') or hc in ('doctor', 'clinic', 'centre', 'rehabilitation', 'hospital') or t.get('building') == 'hospital':
        if has(n, r'primärversorg|\bPVE\b|\bPVZ\b|\bPVN\b|gesundheitszentrum|\bPVE-|gesundheitsnetz|primary care'):
            add('primaerversorgung')
        elif hc == 'rehabilitation' or has(n, r'reha|rehabilitation|kurhaus|kurzentrum|kuranstalt|kurklinik|lebens\.?resort|gesundheitsresort|moorheilbad|moorbad|kurhotel|therapiezentrum|kurheim|thermenklinik|klinik (pirawarth|malcherhof|bad pirawarth)|gesundheitsresort|kurpark'):
            if not has(n, r'landesklinikum|universitätsklinikum|physio\b'):
                add('reha')
        elif am in ('doctors',) or hc == 'doctor' or (am == 'clinic' and not has(n, r'tier|veterin|krankenhaus|klinikum|spital|landesklinik')):
            if not has(n, r'rotes kreuz|rettung|samariter|notarzt|ärztefunk|tierarzt|tierärzt|veterin|zahnarzt|zahn|dental|kieferorth|psychothera|physio|ergothera|logopäd|heilmasseur|massage|tierklinik|kleintier|labor|blutspende|apotheke|optik|hörgerät|kosmetik'):
                if name and not has(n, r'^(ordination|praxis|arztpraxis|arzt|ärztezentrum)$'):
                    add('arztpraxis')
    if to == 'hotel' and has(n, r'kurhotel|kurhaus|lebens\.resort|gesundheitsresort|reha'):
        add('reha')

    # ---- Verkehr
    rw = t.get('railway')
    if rw == 'station' and t.get('station') not in ('subway',):
        add('bahnhof')
    if rw == 'halt':
        add('haltestelle')
    if t.get('highway') == 'services':
        add('raststation')

    # ---- Einkauf
    if sh == 'supermarket':
        add('supermarkt')
    if sh in ('mall', 'department_store') and has(n, CHAIN_SM) and len(n) < 40:
        add('supermarkt')
    elif (sh == 'mall') or (sh == 'department_store' and not has(n, CHAIN_SM) and (a > 5000 or has(n, r'center|zentrum|einkaufs'))) or (t.get('landuse') == 'retail' and has(n, r'center|zentrum|einkaufs|fachmarkt|\bEKZ\b|\bFMZ\b|shopping|outlet|\bpark\b|city|\bG3\b|\bSCS\b')):
        if not has(n, r'^(kik|takko|tedi|action|pepco|kaufhaus .{0,3})$'):
            add('einkaufszentrum')
    if sh == 'furniture' and (has(n, FURN) or has(t.get('brand', ''), FURN) or a > 4000):
        add('einkaufszentrum')
    if sh in ('doityourself', 'hardware', 'garden_centre', 'building_materials', 'trade', 'agrarian', 'country_store'):
        lag = has(n + ' ' + t.get('brand', '') + ' ' + t.get('operator', ''), r'lagerhaus|\bRWA\b|raiffeisen')
        if sh in ('doityourself',) and (has(n, BIG_DIY) or has(t.get('brand', ''), BIG_DIY) or a > 2500 or lag):
            add('baumarkt')
        elif sh in ('hardware', 'building_materials', 'trade', 'garden_centre') and (has(n, BIG_DIY) or has(t.get('brand', ''), BIG_DIY)):
            add('baumarkt')
        if lag:
            if sh in ('doityourself', 'hardware', 'garden_centre', 'building_materials', 'trade'):
                add('baumarkt')
            add('lagerhaus')
        elif sh == 'agrarian' and has(n, r'agrar|landhandel|genossenschaft|landesprodukten|saatbau|getreide'):
            add('lagerhaus')

    # ---- Wasser (before generic sport)
    open_water = is_open_water(t)
    pool = is_pool(t)
    pool_ctx = pool or (le == 'resort' and not open_water)
    indoor = t.get('indoor') == 'yes' or t.get('location') == 'indoor' or t.get('covered') == 'yes'
    water_ok = not (to in ('camp_site', 'caravan_site', 'hotel', 'apartment') or am in ('restaurant', 'cafe', 'bar', 'pub', 'parking', 'fast_food', 'bus_station') or sh or t.get('highway') or t.get('railway') or has(n, r'becken|weg zum|parkplatz|kantine|buffet|imbiss|kiosk|restaurant|wohnmobil|stellplatz|haltestelle'))
    if water_ok and not (open_water and not pool) and (pool_ctx or has(n, r'therme|thermal|hallenbad|freibad|strandbad|erlebnisbad|sommerbad|waldbad|schwimmbad|badearena|aqua|\bbad$')):
        if has(n, r'therme|thermal|römertherme|kurbad|moorbad|sole|thermalbad|aqua ?city|badener römer|wellness ?bad|asia spa|thermen'):
            if pool_ctx or am == 'public_bath' or le in ('water_park', 'sports_centre', 'resort') or to in ('attraction',) or hc:
                add('therme')
        if has(n, r'hallenbad|hallen-|indoor|badearena|schwimmhalle'):
            add('hallenbad')
        if has(n, r'freibad|strandbad|erlebnisbad|sommerbad|waldbad|parkbad|naturbad|familienbad|schwimmbad|badeanlage|\bbad\b') and not has(n, r'hallen|therme'):
            if not has(n, r'^(bad|schwimmbad)$') or le in ('water_park', 'sports_centre') or am == 'public_bath' or a > 2000:
                add('freibad')
        if not any(k in K for k in ('therme', 'hallenbad', 'freibad', 'badesee')) and name:
            if le in ('water_park', 'sports_centre') and 'swimming' in sp or am == 'public_bath' or le == 'water_park':
                add('hallenbad' if indoor and le != 'water_park' else 'freibad')
            elif le == 'swimming_pool' and a > 300 and t.get('access') not in ('private', 'customers', 'no') and not indoor:
                if not has(n, r'becken|kinder|nichtschwimm|sportbecken|sprung|planschbecken|rutsche|whirlpool|pool$|^pool|lehrschwimm'):
                    add('freibad')
            elif le == 'swimming_pool' and indoor and a > 250 and not has(n, r'becken|kinder|nichtschwimm|pool'):
                add('hallenbad')
    if not pool and (le in ('bathing_place', 'beach_resort', 'swimming_area') or (t.get('natural') == 'beach' and ('swimming' in sp or has(n, r'bade'))) or t.get('water_park') in ('lake', 'natural', 'river', 'pond') or (t.get('natural') == 'water' and (t.get('swimming') == 'yes' or has(n, r'badesee|badeteich|badeplatz|strandbad|schwimmteich|flussbad')))
       or (to == 'attraction' and has(n, r'badesee|badeteich'))):
        if name: add('badesee')

    # ---- Sport
    if le == 'stadium' or (le in ('sports_centre', 'pitch', 'recreation_ground') and ('soccer' in sp or 'football' in sp or 'american_football' in sp or 'rugby' in sp)) \
       or (t.get('landuse') == 'recreation_ground' and has(n, r'sportplatz|fußball|stadion|sportanlage')) \
       or (le in ('sports_centre', 'pitch') and has(n, r'sportplatz|fußballplatz|fussballplatz|trainingsplatz|stadion|arena|sportanlage|sportzentrum|sportpark|\bSC\b|\bSV\b|\bUSV\b|\bFC\b|\bASK\b|\bSK\b|\bUSC\b|\bASV\b|\bATSV\b|\bSKN\b|\bASKÖ\b|\bUFC\b') and not has(n, r'tennis|halle|\beis|\breit|golf|\bkart|kletter|beach|basket|stockschütz|stocksport|\basphalt') and (not indoor or le == 'stadium')):
        if not (le == 'sports_centre' and indoor and le != 'stadium'):
            add('sportplatz')
    if le in ('sports_hall',) or t.get('building') == 'sports_hall' or (le == 'sports_centre' and (indoor or has(n, r'halle|sporthalle|turnhalle|mehrzweckhalle|sportzentrum|arena|bowling|kegel|squash|badminton')) and not has(n, r'tennis|kletter|boulder|eis|reit|fitness|kart|schwimm|bad\b|bad$|therme')):
        if not K or le in ('sports_hall', 'sports_centre') :
            if 'sportplatz' not in K and not any(k in K for k in ('freibad', 'hallenbad', 'therme')):
                add('sporthalle')
    if le == 'fitness_centre' or (le == 'sports_centre' and ('fitness' in sp) and not has(n, r'turnhalle')) or (le == 'sports_centre' and has(n, r'fitness|gym|\bfit\b|fit$|bodyland|bodyzone|health ?club|pilates|crossfit|clever fit|fit ?inn|injoy|john harris|mrs\.? sporty|kieser')):
        add('fitnessstudio')
    if le in ('horse_riding', 'horse_riding_hall') or 'equestrian' in sp or 'horse_racing' in sp or am == 'stables' or t.get('building') == 'riding_hall' \
       or (name and has(n, r'reitstall|reiterhof|reitanlage|reitclub|reitverein|reitschule|reitzentrum|reitsport|pferdehof|pferdesport|gestüt|reithalle|pferdezentrum|equi|ranch|islandpferde|pferdepension|einstellbetrieb|haflinger|vierkanthof.*pferd') and (le or am or t.get('landuse') or t.get('building') or sh == 'farm' or to)):
        if not has(n, r'reitweg|reitroute|gasthof|gasthaus|tierarzt|shop|bedarf|zubehör'):
            add('reitanlage')
    if 'tennis' in sp and le in ('pitch', 'sports_centre', 'sports_hall', 'club') or t.get('club') == 'sport' and 'tennis' in sp or (has(n, r'\btennis|\bTC\b|\bUTC\b|\bTSV\b.*tennis') and (le or t.get('club') or t.get('building'))):
        if not has(n, r'tischtennis') or le == 'sports_centre':
            if name: add('tennis')
    if le == 'golf_course' or ('golf' in sp and le in ('sports_centre', 'club')) or (t.get('club') == 'golf'):
        if not has(n, r'mini|adventure|crazy|abenteuer|disc|frisbee|footgolf|fußballgolf|soccergolf|swingolf|swin'):
            add('golf')
    if 'climbing' in sp and le in ('sports_centre', 'pitch', 'sports_hall', 'climbing', 'adventure_park') or le in ('adventure_park', 'climbing') \
       or has(n, r'kletterhalle|kletterzentrum|boulder|hochseil|seilgarten|kletterpark|kletterwald|waldseilpark|kletteranlage|kletterwand|klettergarten|flying fox'):
        if name and (le or to or am or t.get('building') or t.get('natural') or 'climbing' in sp):
            add('kletteranlage')
    if t.get('landuse') == 'winter_sports' or (le == 'sports_centre' and 'skiing' in sp) or (to == 'attraction' and has(n, r'skigebiet|skilift|skiarena|schigebiet')):
        if name or a > 200000: add('skigebiet')
    if le == 'ice_rink' or (le in ('sports_centre', 'pitch', 'stadium') and (sp & {'ice_skating', 'ice_hockey', 'ice_stock', 'curling'}) and has(n, r'eis|ice|kunsteis')):
        if not has(n, r'stock|schütz|curling') or has(n, r'eislauf|eishalle|kunsteis|eissporthalle|eisarena|eishockey'):
            add('eislaufplatz')
    if (sp & {'motor', 'karting', 'motocross', 'motorcycle', 'speedway', 'rc_car', 'automotive', 'enduro', 'quad'} and le in ('track', 'sports_centre', 'pitch', 'raceway')) \
       or (has(n, r'\bkart\b|kartbahn|karting|go-?kart|kartcenter|kartarena|kart-|motocross|\bMX\b|raceway|speedway|motorsport|wachauring|pannoniaring|fahrtechnik|driving camp|offroad ?park|motodrom|fahrsicherheit|motopark|race ?park') and (le or to or am in ('driver_training',) or t.get('landuse'))):
        if not has(n, r'model|rc-|\brc\b|slot|carrera|go-?kart-?verleih$'):
            add('motorsport')

    # ---- Freizeit
    if to == 'theme_park' or (to == 'attraction' and has(n, r'familypark|erlebnispark|freizeitpark|märchenpark|abenteuerpark|erlebniswelt|funpark|vergnügungspark|prater|sommerrodel|rodelbahn|erlebnisberg|kinderwelt|spielepark|minopolis|dinosaurier')) \
       or (le == 'water_park' and has(n, r'erlebnis|fun|abenteuer')):
        if name and a == 0 or a > 3000 or has(n, r'park|welt|rodel'):
            add('freizeitpark')
    if to == 'zoo' or (to == 'attraction' and has(n, r'tierpark|wildpark|tiergarten|\bzoo\b|wildgehege|greifvogel|falknerei|reptilien|vogelpark|streichelzoo|wildtier|bärenwald|haustierhof|schmetterlingshaus|affen')):
        if name and not has(n, r'gehege$|^gehege|^stall|^voliere|^ziegen|^schafe|^esel|^hühner|^pferde|^schweine|^kaninchen'):
            add('tierpark')
    if am in ('cinema', 'theatre', 'arts_centre', 'events_venue', 'concert_hall', 'conference_centre', 'exhibition_centre', 'music_venue') \
       or (am in ('community_centre', 'social_centre', 'townhall') and has(n, r'stadtsaal|veranstaltungs|festsaal|kulturzentrum|kulturhaus|stadthalle|volksheim|arena|forum|festspielhaus|kulturszene|kulturfabrik|stadtsäle|gemeindezentrum|mehrzweck|veranstaltungshalle|kulturforum|kultursaal|kultur- und|freizeitzentrum|ballsaal|halle\b|eventhalle|kongress|messe')) \
       or (name and has(n, r'festivalgelände|festgelände|open ?air|freiluftbühne|seebühne|felsenbühne|festspiel|messegelände|veranstaltungsgelände|eventzentrum|festival|veranstaltungszentrum|stadtsaal|kongress')) and (am or le or to or t.get('landuse') or t.get('building')) \
       or le == 'stadium' and has(n, r'arena|stadion') and False:
        if not has(n, r'kunstschule|atelier|galerie$|jugendzentrum|jugendtreff|pfarrheim$'):
            if name: add('veranstaltung')
    if to == 'museum' or (to == 'gallery' and has(n, r'museum|kunsthalle|landesgalerie')) or (to == 'attraction' and has(n, r'museum')):
        if name: add('museum')
    if to in ('camp_site', 'caravan_site') and t.get('group_only') != 'yes' and t.get('backcountry') != 'yes' and t.get('camp_site') not in ('basic',):
        if name: add('campingplatz')
    hi = t.get('historic')
    if hi in ('castle', 'palace', 'manor', 'fort', 'ruins', 'monastery', 'archaeological_site'):
        visitor = to in ('attraction', 'museum', 'viewpoint') or t.get('opening_hours') or t.get('fee') or t.get('charge') or (t.get('website') and hi in ('castle', 'palace', 'fort', 'monastery')) or t.get('castle_type') == 'stately'
        if hi == 'ruins' and (has(n, r'ruine|burg|schloss|kloster|kirche|kartause|wehr|turm|kapelle') or t.get('ruins') in ('castle',) or t.get('castle_type')):
            visitor = True
        if hi == 'archaeological_site':
            visitor = to in ('attraction', 'museum') or has(n, r'carnuntum|freilicht|museum|archäologiepark|heidentor|keltendorf|urzeit')
        if visitor and name and t.get('access') not in ('private', 'no'):
            add('ausflugsziel')
    if (am == 'monastery' or hi == 'monastery' or t.get('landuse') == 'religious' or t.get('building') == 'monastery') and has(n, r'^stift\b|^kloster|^kartause|^abtei|^zisterzienser|^benediktiner|basilika|wallfahrt') and name:
        if a == 0 or a > 3000: add('ausflugsziel')
    if (t.get('man_made') in ('tower', 'observation_tower') and t.get('tower:type') == 'observation') or (name and has(n, r'warte\b|aussichtswarte|aussichtsturm|aussichtswarte|-warte|warte$|skywalk|himmelsleiter') and (t.get('man_made') or to or hi or t.get('building'))):
        if name and t.get('access') not in ('private', 'no'): add('ausflugsziel')
    if to == 'viewpoint' and name and has(n, r'warte|turm|blick|aussicht|kanzel|plattform|skywalk|kreuz|kogel|stein|berg|felsen|höhe|kuppe|schöne|pavillon|tempel|kapelle|riegel|wand|kamm|spitz') and not has(n, r'^aussichtspunkt$|^viewpoint$|^aussicht$|^rastplatz$|^bank$'):
        add('ausflugsziel')
    if name and (t.get('natural') in ('gorge', 'cave_entrance') and (to or t.get('show_cave') or has(n, r'klamm|schlucht|tropfstein|höhle|graben')) and (t.get('natural') == 'gorge' or to or t.get('show_cave'))):
        add('ausflugsziel')
    if name and t.get('waterway') == 'waterfall' and (to or t.get('wikidata')):
        add('ausflugsziel')
    if to == 'attraction' and name and has(n, r'burg|ruine|schloss|stift|kloster|warte|klamm|schlucht|höhle|wasserfall|kellergasse|basilika|wallfahrt|dom\b|aussicht|garten|arboretum|lehrpfad|naturpark|baumwipfel|hängebrücke|sommerrodel|keltendorf|carnuntum|museumsdorf|freilicht|kellerviertel|kellertrift|ötscher|stausee|bergbau|schaubergwerk|naturdenkmal|wallfahrtskirche'):
        if not has(n, r'kinderspiel|spielplatz|bank|brunnen$|bildstock|marterl|denkmal$'):
            add('ausflugsziel')

    # ---- Gastro
    if am == 'nightclub' or (am in ('bar', 'pub') and has(n, r'disco|disko|discothek|diskothek|tanzbar|\bclub\b|tanzlokal|nightclub|dancing')) or (le == 'dance' and has(n, r'disco|disko|club')):
        if name and not has(n, r'golfclub|tennisclub|reitclub|nachtclub|laufhaus|studio|night ?club|bordell|massage|sauna club|saunaclub|go-go|kontakt'):
            add('disco')
    cu = t.get('cuisine', '')
    if (am in ('restaurant', 'bar', 'pub', 'wine_bar', 'biergarten', 'cafe') or t.get('craft') == 'winery' or sh in ('wine', 'farm') or to == 'wine_cellar') and \
       (has(cu, r'heurig|buschenschank') or has(n, r'heurig|buschensch|buschenschank|buschenschenke|heuriger|ausg.?steckt|weinschenke|mostheurig|mostschenke|heurigenlokal|weinhaus.*heur') or t.get('heuriger') == 'yes' or t.get('buschenschank') == 'yes'):
        if name: add('heuriger')
    if to == 'hotel' and name:
        if not has(n, r'^hotel$'):
            add('hotel')

    # ---- Arbeit
    lu = t.get('landuse')
    mm = t.get('man_made')
    gen_estate = has(n, r'gewerbe(gebiet|park|zone)|betriebs(gebiet|zone|ansiedlung|areal)|industrie(gebiet|park|zone|zentrum)|wirtschaftspark|ecoplus|technologiepark|handwerkerzone|gewerbezone|businesspark|business park|gewerbehof|gewerbegrund')
    if mm == 'works' and name or (lu == 'industrial' and name and a > 30000 and not gen_estate) or (t.get('building') == 'industrial' and name and a > 8000):
        if not has(n, r'kläranlage|abwasser|wasserwerk|umspannwerk|bauhof|altstoff|deponie|kompost|recycl|wertstoff|lagerhaus|sägewerk|sägwerk|säge\b|steinbruch|kraftwerk|biogas|heizwerk|parkplatz') and t.get('industrial') not in ('scrap_yard',):
            add('industrie')
    if lu == 'quarry' or mm == 'mineshaft' and has(n, r'bergbau|stollen'):
        if t.get('disused') != 'yes' and t.get('resource') != 'no' and (name or a > 30000):
            add('steinbruch')
    if t.get('craft') == 'sawmill' or (name and has(n, r'sägewerk|sägwerk|sagewerk|säge\b|sägewerke|holzindustrie|holzwerk|holzverarbeitung|säge [a-zäöü]|sägerei') and (lu or mm or t.get('craft') or t.get('building') or t.get('office') or sh == 'trade')):
        add('saegewerk')
    if name and has(n + ' ' + t.get('operator', ''), r'lagerhaus|\bRWA\b|raiffeisen ware|getreidesilo|agrarzentrum|agrar.*genossenschaft|saatbau|lagerhausgenossenschaft|agrana|getreidelager|übernahmestelle') and \
       (mm in ('silo', 'storage_tank', 'works') or lu in ('industrial', 'farmyard', 'retail', 'commercial') or sh in ('agrarian', 'doityourself', 'garden_centre', 'hardware', 'trade', 'country_store') or t.get('building') or t.get('office')):
        if not has(n, r'tankstelle|bank|raiffeisenbank|raiffeisenkasse|versicherung'):
            if not has(n, r'agrana') or mm == 'silo':
                add('lagerhaus')
            if sh in ('doityourself', 'hardware', 'garden_centre') and has(n, r'lagerhaus'): add('baumarkt')
    if t.get('power') == 'plant':
        src = t.get('plant:source', '') + t.get('generator:source', '')
        out = t.get('plant:output:electricity', '')
        mw = 0.0
        mo = re.match(r'\s*([\d.,]+)\s*(GW|MW|kW|W)?', out or '')
        if mo:
            try:
                v = float(mo.group(1).replace(',', '.')); u = (mo.group(2) or 'W')
                mw = v * {'GW': 1000, 'MW': 1, 'kW': 0.001, 'W': 1e-6}[u]
            except ValueError: pass
        ok = False
        if 'solar' in src or 'photovoltaic' in src: ok = mw >= 10 or (name and a > 150000)
        elif 'hydro' in src: ok = mw >= 1 or has(n, r'donaukraftwerk|kraftwerk (melk|ybbs|altenwörth|greifenstein|freudenau|ottenstein|dobra)|speicher|pumpspeicher') or (name and a > 8000)
        elif 'wind' in src: ok = bool(name)
        else: ok = bool(name) or mw >= 5
        if ok and (name or mw >= 5): add('kraftwerk')

    # ---- Bus / Wasserzugang
    if am == 'bus_station' and name and not has(n, r'parkplatz|charter|depot|garage|remise|betriebshof'):
        add('busbahnhof')
    pier_ok = has(n, r'hafen|steg|anleg|lände|lande|mole|slip|boot|ruder|zillen|yacht|jacht|fähr|pier|werft|wassersport|segel|kanu|kajak|pionier|überfuhr|spitz$') \
        and not has(n, r'^DST\b|straße|strasse|\bpv\b|photovoltaik|bühne|schwimminsel|restaurant')
    if le == 'marina' or am == 'ferry_terminal' or (t.get('route') == 'ferry' and not has(n, r'floß|flossfahrt|teich')) \
       or le == 'slipway' or (t.get('man_made') == 'pier' and pier_ok):
        if name: add('hafen')

    # ---- Sonstiges
    aw = t.get('aeroway')
    if aw in ('aerodrome', 'heliport') or (aw == 'airstrip' and has(n, r'flugplatz|flugfeld|landeplatz|airfield|segelflug')):
        if name and not has(n, r'modell|rc-|klinikum|krankenhaus|spital|hospital|landesklinik|lkh|\bLK\b|uniklinik|ultraleicht.*modell'):
            if not (aw == 'heliport' and t.get('emergency') == 'yes' and has(t.get('operator', ''), r'klinik|landesgesundheit|lga')):
                add('landeplatz')

    return K


# category groups for merging
GROUP = {}
for g, ks in {
    'pflege': 'pflegeheim betreutes_wohnen behinderteneinrichtung',
    'kinder': 'kinderkrippe kindergarten',
    'schule': 'volksschule mittelschule hoehere_schule berufsschule sonderschule hochschule',
    'gesund': 'arztpraxis primaerversorgung reha',
    'bahn': 'bahnhof haltestelle busbahnhof bushaltestelle',
    'hafen': 'hafen',
    'rast': 'raststation',
    'shop': 'supermarkt einkaufszentrum baumarkt lagerhaus',
    'sport': 'sportplatz sporthalle fitnessstudio tennis kletteranlage eislaufplatz motorsport',
    'reit': 'reitanlage', 'golf': 'golf', 'ski': 'skigebiet',
    'wasser': 'freibad hallenbad therme badesee',
    'frei': 'freizeitpark tierpark veranstaltung museum campingplatz ausflugsziel',
    'gastro': 'disco heuriger hotel',
    'arbeit': 'industrie steinbruch saegewerk kraftwerk',
    'luft': 'landeplatz'}.items():
    for k in ks.split(): GROUP[k] = g
ALLKEYS = list(GROUP)
ORDER = {k: i for i, k in enumerate(['pflegeheim', 'betreutes_wohnen', 'behinderteneinrichtung', 'kinderkrippe', 'kindergarten',
    'volksschule', 'sonderschule', 'hoehere_schule', 'mittelschule', 'berufsschule', 'hochschule', 'primaerversorgung', 'reha', 'arztpraxis',
    'bahnhof', 'haltestelle', 'busbahnhof', 'bushaltestelle', 'raststation', 'einkaufszentrum', 'supermarkt', 'baumarkt',
    'sportplatz', 'sporthalle', 'fitnessstudio', 'reitanlage', 'tennis', 'golf', 'kletteranlage', 'skigebiet', 'eislaufplatz', 'motorsport',
    'hallenbad', 'freibad', 'therme', 'badesee', 'hafen', 'freizeitpark', 'tierpark', 'veranstaltung', 'museum', 'campingplatz', 'ausflugsziel',
    'disco', 'heuriger', 'hotel', 'industrie', 'steinbruch', 'saegewerk', 'lagerhaus', 'kraftwerk', 'landeplatz'])}
HUGE_KEYS = {'steinbruch', 'skigebiet', 'golf', 'industrie', 'campingplatz', 'freizeitpark', 'tierpark', 'landeplatz', 'kraftwerk', 'motorsport', 'reitanlage', 'lagerhaus', 'ausflugsziel', 'einkaufszentrum', 'sportplatz', 'badesee', 'saegewerk'}
HUGE_M2 = 120000

def drop(t, name):
    if t.get('access') in ('private', 'no') and not t.get('amenity') in ('nursing_home', 'school', 'kindergarten'):
        return True
    for k in t:
        if k.startswith(('disused', 'abandoned', 'was:', 'demolished', 'removed', 'razed', 'construction:', 'proposed')):
            if k.split(':')[0] in ('disused', 'abandoned', 'was', 'demolished', 'removed', 'razed') and (':' not in k or k.split(':')[1] in ('amenity', 'shop', 'leisure', 'tourism', 'railway', 'landuse', 'man_made', 'power', 'aeroway', 'social_facility', 'name')):
                if ':' in k: return True
    if t.get('disused') == 'yes' or t.get('abandoned') == 'yes' or t.get('end_date') or t.get('construction'):
        return True
    if t.get('railway') in ('station', 'halt') and t.get('railway:historic'): return True
    if t.get('landuse') == 'quarry' and t.get('quarry') in ('abandoned', 'disused'): return True
    if t.get('opening_hours') in ('closed', 'off') or t.get('opening_hours:covid19') == 'closed' and False: return True
    if name and CLOSED.search(name): return True
    return False

# ---------------------------------------------------------------- main loop
rows = []
unnamed_pitches = []
unnamed_edu = []
bus_objs = []

def edu_type(t):
    """category key for an unnamed kindergarten/school, only if the tags make it clear"""
    am = t.get('amenity')
    if am in ('kindergarten', 'childcare'):
        if am == 'childcare' or t.get('nursery') == 'yes' or t.get('kindergarten:type') in ('nursery', 'krabbelstube') \
           or re.search(r'krippe|krabbel|nursery', t.get('description', '') + t.get('kindergarten:type', ''), re.I):
            return 'kinderkrippe'
        return 'kindergarten'
    isced = set(re.split(r'[;,]\s*', t.get('isced:level', ''))) - {''}
    sch = (t.get('school', '') + ' ' + t.get('school:AT', '')).lower()
    op = t.get('operator', '')
    gr = re.match(r'^\s*(\d+)\s*-\s*(\d+)\s*$', t.get('grades', ''))
    if isced == {'1'} or re.search(r'primary|volksschule', sch) or re.search(r'volksschule', op, re.I) or (gr and int(gr.group(2)) <= 4):
        return 'volksschule'
    if isced == {'2'} or re.search(r'lower_secondary|mittelschule', sch) or re.search(r'mittelschule', op, re.I) or (gr and int(gr.group(1)) >= 5 and int(gr.group(2)) <= 9):
        return 'mittelschule'
    return None

dropped = collections.Counter()
for r in RECS:
    t = r['tags']; g = r['g']
    if t.get('boundary') == 'administrative': continue
    name = (t.get('name') or '').strip()
    a = area_m2(g) if g.geom_type in ('Polygon', 'MultiPolygon') else 0.0
    if not name:
        if t.get('leisure') in ('pitch', 'sports_centre', 'stadium') and (sports(t) & {'soccer', 'football'} or t.get('leisure') == 'stadium') and a > 4000:
            if not drop(t, ''): unnamed_pitches.append(r)
        elif t.get('landuse') == 'quarry' and a > 30000:
            pass  # handled below with generated name
        elif t.get('landuse') == 'winter_sports' and a > 200000:
            pass
        elif UNNAMED_EDU and t.get('amenity') in ('kindergarten', 'childcare', 'school'):
            k = edu_type(t)
            if k and not drop(t, ''):
                unnamed_edu.append((r, k))
            continue
        else:
            continue
    if drop(t, name):
        dropped['closed/private'] += 1; continue
    if name and re.match(r'(?i)^(platz|feld|court|spielfeld|trainingsplatz|nebenplatz|hauptplatz|kunstrasen\w*|rasenplatz|tennisplatz|sandplatz|halle|becken)\s*[0-9a-z]?$', name):
        if t.get('leisure') == 'pitch' and sports(t) & {'soccer'} and a > 4000:
            unnamed_pitches.append(r)
        continue
    if name and re.match(r'(?i)^(start|end|ziel|tal|berg)(punkt|station)\b', name):
        continue
    if t.get('amenity') == 'parking' or re.match(r'(?i)^(park(platz|deck|haus)|p\d|zufahrt|eingang)\b', name):
        continue
    if is_bus(t) and not (t.get('amenity') or t.get('leisure') or t.get('tourism') or t.get('shop') or t.get('railway')):
        if name and not drop(t, name): bus_objs.append(r)
        continue
    keys = classify(t, g, a)
    if not keys: continue
    if not name:
        if keys == ['steinbruch'] or 'steinbruch' in keys:
            name = None  # set later with Ort
        elif 'skigebiet' in keys:
            name = None
        else:
            continue
    rows.append({'osm': r['t'] + str(r['id']), 'tags': t, 'g': g, 'area': a, 'keys': keys, 'name': name, 'gen': name is None, 'raw': name})

# unnamed kindergartens / schools with clear type
for r, k in unnamed_edu:
    rows.append({'osm': r['t'] + str(r['id']), 'tags': r['tags'], 'g': r['g'], 'area': area_m2(r['g']) if r['g'].geom_type in ('Polygon', 'MultiPolygon') else 0.0,
                 'keys': [k], 'name': None, 'gen': True, 'edu': k})

# unnamed soccer grounds
for r in unnamed_pitches:
    rows.append({'osm': r['t'] + str(r['id']), 'tags': r['tags'], 'g': r['g'], 'area': area_m2(r['g']), 'keys': ['sportplatz'], 'name': None, 'gen': True, 'pitch': True})

print('classified rows', len(rows))

# ---------------------------------------------------------------- coordinates
def access_point(row):
    g = row['g']; ks = set(row['keys'])
    if g.geom_type == 'Point': return g, ''
    if g.geom_type in ('LineString', 'MultiLineString'): return g.interpolate(0.5, normalized=True), ''
    c = g.centroid
    if not g.contains(c): c = g.representative_point()
    if row['area'] > HUGE_M2 and ks & HUGE_KEYS:
        buf = g.buffer(0.004 if 'skigebiet' in ks else 0.0015)
        cands = [parkings[i] for i in PKT.query(buf) if buf.contains(parkings[i][0])]
        if cands:
            p = max(cands, key=lambda x: (x[1], -dist(x[0], c)))[0]
            return Point(p.x, p.y), 'Parkplatz'
        if GTT is not None:
            gs = [gates[i] for i in GTT.query(g.buffer(0.0005)) if g.buffer(0.0005).contains(gates[i])]
            if gs:
                return min(gs, key=lambda x: dist(x, c)), 'Zufahrt'
        return c, 'Mitte'
    return c, ''

for row in rows:
    p, how = access_point(row)
    row['p'] = Point(round(p.x, 6), round(p.y, 6)); row['how'] = how

# inside NÖ + Gemeinde
kept = []
for row in rows:
    if not NOEP.contains(row['p']):
        dropped['outside NÖ'] += 1; continue
    row['ort'] = gemeinde(row['p'])
    if not row['ort']:
        dropped['no gemeinde'] += 1; continue
    row['bez'] = bezirk(row['p'])
    row['loc'] = locality(row['p'], row['tags']) or row['ort']
    kept.append(row)
rows = kept
print('inside NÖ', len(rows), dict(dropped))

# ---------------------------------------------------------------- names
CHAIN_RE = re.compile(r'^(billa( plus)?|spar|eurospar|interspar|spar gourmet|hofer|lidl|penny( markt)?|unimarkt|mpreis|m-preis|merkur|adeg|nah ?& ?frisch|maximarkt|obi|hornbach|bauhaus|hagebau|lagerhaus|xxxlutz|möbelix|kika|leiner|mömax|ikea|fit ?inn|clever ?fit|mrs\.? ?sporty|injoy|john harris|mcfit|lagerhaus bau ?& ?garten|lagerhaus.*)$', re.I)
for row in rows:
    t = row['tags']; nm = row['name']; ks = row['keys']
    row['ergaenzt'] = False
    if nm is None:
        if row.get('pitch'): nm = 'Sportplatz ' + row['loc']
        elif row.get('edu'):
            nm = {'kindergarten': 'Kindergarten', 'kinderkrippe': 'Kinderkrippe', 'volksschule': 'Volksschule', 'mittelschule': 'Mittelschule'}[row['edu']] + ' ' + row['loc']
        elif 'steinbruch' in ks:
            op = t.get('operator')
            nm = ('Steinbruch ' + (op + ' ' if op else '') + row['loc'])
        elif 'skigebiet' in ks: nm = 'Skigebiet ' + row['loc']
        row['ergaenzt'] = True
    else:
        chain = CHAIN_RE.match(nm) or ('supermarkt' in ks and fold(nm) in (fold(t.get('brand', '')), )) or (('supermarkt' in ks or 'baumarkt' in ks or 'fitnessstudio' in ks) and len(fold(nm).split()) <= 2 and t.get('brand') and fold(t.get('brand')) in fold(nm))
        loc = row['loc']
        if chain:
            if fold(loc) not in fold(nm):
                nm = nm + ' ' + loc
            st = t.get('addr:street') or t.get('addr:place')
            if st and fold(st) != fold(loc):
                nm = nm + ' (' + st + ')'
            row['ergaenzt'] = True; row['chain'] = True
        elif is_generic(nm) and fold(loc) not in fold(nm) and fold(row['ort']) not in fold(nm):
            nm = nm + ' ' + loc
            row['ergaenzt'] = True
    row['name'] = re.sub(r'\s+', ' ', nm.replace(';', ',')).strip()

STOP = {'nö', 'no', 'landes', 'der', 'die', 'das', 'und', 'an', 'am', 'im', 'in', 'bei', 'st', 'sankt', 'gmbh', 'co', 'kg'}
ABBR = {'nms': 'mittelschule', 'ms': 'mittelschule', 'nnoms': 'mittelschule', 'nnms': 'mittelschule', 'vs': 'volksschule', 'kiga': 'kindergarten',
        'landeskindergarten': 'kindergarten', 'pvz': 'primarversorgungszentrum', 'gesundheitszentrum': 'primarversorgungszentrum', 'pve': 'primarversorgungszentrum',
        'pbz': 'pflege', 'pflegeheim': 'pflege', 'landespflegeheim': 'pflege', 'pflegezentrum': 'pflege'}
STOP |= {'neue', 'niederosterreichische', 'niederosterreich', 'markt', 'stadt', 'gemeinde'}
def core(fn): return ' '.join(ABBR.get(x, x) for x in fn.split() if x not in STOP)
def similar(a, b):
    ca, cb = core(a['fn']), core(b['fn'])
    if not ca or not cb: return False
    if ca == cb: return True
    if a.get('chain') and b.get('chain') and a.get('raw') and fold(a['raw']) == fold(b.get('raw', '')) and dist(a['p'], b['p']) < 100: return True
    if 'bahn' in a.get('grp', ()) and 'bahn' in b.get('grp', ()) and (ca.startswith(cb) or cb.startswith(ca)): return True
    if a['ergaenzt'] or b['ergaenzt']:
        # generated/augmented names: strict
        return difflib.SequenceMatcher(None, ca, cb).ratio() >= 0.92
    if len(ca) >= 6 and len(cb) >= 6 and (ca in cb or cb in ca): return True
    ta, tb = set(ca.split()), set(cb.split())
    if min(len(ta), len(tb)) >= 2 and (ta <= tb or tb <= ta): return True
    da, db = ta - tb, tb - ta
    if da and db:
        for x in da:
            if len(x) >= 4 or x.isdigit():
                if max(difflib.SequenceMatcher(None, x, y).ratio() for y in db) < 0.8:
                    return False
    return difflib.SequenceMatcher(None, ca, cb).ratio() >= 0.85


# ---------------------------------------------------------------- Pflegeheim base list (checked v1)
old = {}
with open(OLD, encoding='utf-8') as f:
    rd = csv.reader(f, delimiter=';')
    hdr = next(rd)
    for rr in rd:
        if rr[2] == 'Pflegeheim':
            old[rr[0][4:]] = rr
byosm = {}
for row in rows: byosm.setdefault(row['osm'], row)
added_old = 0
for oid, rr in old.items():
    note = rr[6]
    src = 'Liste Land NÖ 2024' if 'Private Pflegeheime' in note else ('Liste LGA' if 'landesgesundheitsagentur' in note else 'nur OSM-Tag')
    if oid in byosm:
        row = byosm[oid]
        if 'pflegeheim' not in row['keys']: row['keys'].insert(0, 'pflegeheim')
        if 'arztpraxis' in row['keys'] and not similar({'fn': fold(rr[1]), 'ergaenzt': False}, {'fn': fold(row['name']), 'ergaenzt': False}):
            row['keys'] = [k for k in row['keys'] if k != 'arztpraxis']
        row['name'] = rr[1]; row['src'] = src; row['old'] = True
    else:
        # object without current match (geometry from v1)
        p = Point(float(rr[5]), float(rr[4]))
        rows.append({'osm': oid, 'tags': {}, 'g': p, 'area': 0, 'keys': ['pflegeheim'], 'name': rr[1], 'gen': False, 'p': p, 'how': '',
                     'ort': gemeinde(p) or rr[3], 'bez': bezirk(p), 'loc': rr[3], 'ergaenzt': False, 'src': src + ' (v1)', 'old': True})
        added_old += 1
print('old pflegeheime matched', len(old) - added_old, 'carried over', added_old)

# ---------------------------------------------------------------- dedupe
for i, row in enumerate(rows):
    row['i'] = i
    row['fn'] = fold(row['name'])
    row['grp'] = {GROUP[k] for k in row['keys']}
par = list(range(len(rows)))
def find(x):
    while par[x] != x:
        par[x] = par[par[x]]; x = par[x]
    return x
def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb: par[rb] = ra

CLOSE_KEYS = set('hafen busbahnhof primaerversorgung reha hochschule hoehere_schule berufsschule supermarkt baumarkt einkaufszentrum bahnhof haltestelle sportplatz freibad hallenbad therme pflegeheim kindergarten volksschule mittelschule tennis reitanlage golf steinbruch skigebiet campingplatz landeplatz raststation lagerhaus'.split())
pts = [r['p'] for r in rows]
PTREE = STRtree(pts)
polys = [(r['i'], r['g']) for r in rows if r['g'].geom_type in ('Polygon', 'MultiPolygon')]
POLYT = STRtree([g for _, g in polys])
merge_reason = collections.Counter()
for r in rows:
    for j in PTREE.query(r['p'].buffer(260 / KX)):
        if j <= r['i']: continue
        s = rows[j]
        if dist(r['p'], s['p']) > 250: continue
        if r['p'].equals(s['p']):
            union(r['i'], j); merge_reason['same coords'] += 1; continue
        if r['grp'] & s['grp'] and similar(r, s):
            union(r['i'], j); merge_reason['name<250m'] += 1; continue
        dd = dist(r['p'], s['p'])
        if dd < (40 if r['keys'][0] in ('pflegeheim', 'primaerversorgung', 'reha', 'hochschule', 'hoehere_schule', 'berufsschule') else 15) and r['keys'][0] == s['keys'][0] and r['keys'][0] in CLOSE_KEYS:
            union(r['i'], j); merge_reason['same key<15m'] += 1; continue
        if 'pflegeheim' in r['keys'] and 'pflegeheim' in s['keys'] and dd < 150:
            union(r['i'], j); merge_reason['pflegeheim<150m'] += 1; continue
        if (r['ergaenzt'] or s['ergaenzt']) and not (r.get('chain') or s.get('chain')) and r['keys'][0] == s['keys'][0] and dd < 150:
            union(r['i'], j); merge_reason['generic same key<150m'] += 1; continue
        if not (r['grp'] & s['grp']) and core(r['fn']) == core(s['fn']) and (dd < 120 or (dd < 250 and not ({'bahn', 'sport'} & (r['grp'] | s['grp'])))):
            union(r['i'], j); merge_reason['same name other cat'] += 1
WATER = {'freibad', 'hallenbad', 'therme', 'badesee'}
for k, (pi, pg) in enumerate(polys):
    P = rows[pi]
    if P['area'] > 300000: continue
    for j in PTREE.query(pg):
        if j == pi: continue
        s = rows[j]
        if not pg.contains(s['p']): continue
        if s['area'] >= P['area']: continue
        kp, ks_ = set(P['keys']), set(s['keys'])
        overlap = kp & ks_ or (kp & WATER and ks_ & WATER)
        if not overlap: continue
        # child generic or similar name or unnamed pitch -> merge into parent
        if similar(P, s) or s['ergaenzt'] or is_generic(s['tags'].get('name', '') or 'x') or s.get('pitch') or s.get('edu') or kp & {'sportplatz', 'freibad', 'therme', 'campingplatz', 'golf', 'skigebiet', 'tierpark', 'freizeitpark'} and ks_ <= (kp | WATER | {'sportplatz', 'sporthalle', 'tennis'}):
            union(pi, j); merge_reason['inside polygon'] += 1
print('merge reasons', dict(merge_reason))

clusters = collections.defaultdict(list)
for r in rows: clusters[find(r['i'])].append(r)

def richness(r):
    return (1 if r.get('old') else 0, 1 if r['tags'].get('railway') in ('station', 'halt') else 0, 0 if r.get('edu') else 1, 0 if re.match(r'^\d{4}\b', r['name']) else 1, 0 if r['ergaenzt'] else 1, 1 if r['g'].geom_type != 'Point' else 0, len(r['tags']))
if ARGS.debug_dir:
    os.makedirs(ARGS.debug_dir, exist_ok=True)
    with open(os.path.join(ARGS.debug_dir, 'merges.txt'), 'w', encoding='utf-8') as dbg:
        for cl in clusters.values():
            if len(cl) > 1: dbg.write(' || '.join(r['name'] + ' [' + ','.join(r['keys']) + ']' for r in cl) + '\n')
WATERFIX = collections.Counter()
final = []
for cl in clusters.values():
    best = max(cl, key=richness)
    keys = []
    for r in sorted(cl, key=lambda r: -richness(r)[0] * 10 - (1 if r is best else 0)):
        for k in r['keys']:
            if k not in keys: keys.append(k)
    # coordinates: polygon unless huge and a node member exists
    poly_members = [r for r in cl if r['g'].geom_type in ('Polygon', 'MultiPolygon')]
    if best.get('old'):
        pt = best['p']
    elif poly_members:
        pm = max(poly_members, key=lambda r: r['area'])
        pt = pm['p']
        nodes = [r for r in cl if r['g'].geom_type == 'Point' and not r['ergaenzt']]
        if pm['area'] > HUGE_M2 and nodes and pm['how'] in ('Mitte', ''):
            pt = nodes[0]['p']
    else:
        pt = best['p']
    if 'badesee' in keys and is_pool(best['tags']):
        keys = [k for k in keys if k != 'badesee'] or ['freibad']
        WATERFIX['badesee removed (pool)'] += 1
    names = []
    for r in [best] + [r for r in cl if r is not best]:
        if re.match(r'^\d{4}\b', r['name']) and any(not re.match(r'^\d{4}\b', x['name']) for x in cl): continue
        if r['ergaenzt'] and len(cl) > 1 and any(not x['ergaenzt'] and not re.match(r'^\d{4}\b', x['name']) for x in cl): continue
        if not any(core(fold(r['name'])) == core(fold(x)) or similar({'fn': fold(r['name']), 'ergaenzt': False}, {'fn': fold(x), 'ergaenzt': False}) for x in names):
            names.append(r['name'])
    name = names[0] if names else best['name']
    if len(names) > 1 and best['p'].equals(pt) and any(r['p'].equals(x['p']) and not similar(r, x) for r in cl for x in cl if r is not x):
        name = ' / '.join(names[:2])
    ids = [best['osm']] + [r['osm'] for r in cl if r is not best]
    hin = 'OSM ' + ids[0]
    if len(ids) > 1: hin += ' (+' + ','.join(ids[1:3]) + ('…' if len(ids) > 3 else '') + ')'
    if best.get('src'): hin += ' · ' + best['src']
    if any(r['ergaenzt'] for r in cl if r is best): hin += ' · Name ergänzt'
    if best['how'] == 'Parkplatz' and pt.equals(best['p']): hin += ' · Pos. Parkplatz'
    elif best['how'] == 'Zufahrt' and pt.equals(best['p']): hin += ' · Pos. Zufahrt'
    if len(hin) > 80: hin = hin[:79] + '…'
    pid = 'poi-' + best['osm'] if re.match(r'^[nwr]\d+$', best['osm']) else 'poi-x-' + best['osm']
    final.append({'id': pid, 'name': name, 'keys': keys, 'ort': gemeinde(pt) or best['ort'], 'bez': bezirk(pt) or best['bez'], 'p': pt, 'hin': hin,
                  'area': max(r['area'] for r in cl), 'loc': best['loc'], 'tags': best['tags'],
                  'gen_edu': best.get('edu') if all(r.get('edu') for r in cl) else None})

# unnamed sportplatz: max one per locality, skip if a named sportplatz in same locality within 1.5km
named_sp = [f for f in final if 'sportplatz' in f['keys'] and not f['name'].startswith('Sportplatz ') ]
gen_sp = [f for f in final if f['keys'] == ['sportplatz'] and 'Name ergänzt' in f['hin'] and f['name'].startswith('Sportplatz ')]
drop_ids = set()
byloc = collections.defaultdict(list)
for f in gen_sp: byloc[f['name']].append(f)
for nm, fs in byloc.items():
    fs.sort(key=lambda f: -f['area'])
    for f in fs[1:]: drop_ids.add(id(f))
    f0 = fs[0]
    if any(dist(f0['p'], g['p']) < 400 for g in named_sp): drop_ids.add(id(f0))
final = [f for f in final if id(f) not in drop_ids]
print('dropped generated sportplatz dups', len(drop_ids))

# unnamed kindergartens/schools: skip if a named object of the same category is within 400 m,
# and keep only one generated row per name within 400 m
drop_ids = set()
kept_gen = collections.defaultdict(list)
named_by_key = collections.defaultdict(list)
for f in final:
    if not f.get('gen_edu'):
        for k in f['keys']: named_by_key[k].append(f['p'])
NK = {k: STRtree(v) for k, v in named_by_key.items()}
for f in sorted([f for f in final if f.get('gen_edu')], key=lambda f: -f['area']):
    k = f['gen_edu']
    if k in NK and any(dist(f['p'], named_by_key[k][i]) < 400 for i in NK[k].query(f['p'].buffer(400 / KX))):
        drop_ids.add(id(f)); continue
    if any(dist(f['p'], g['p']) < 400 for g in kept_gen[f['name']]):
        drop_ids.add(id(f)); continue
    kept_gen[f['name']].append(f)
final = [f for f in final if id(f) not in drop_ids]
print('unnamed edu: candidates', len(unnamed_edu), 'dropped near named/dup', len(drop_ids),
      'added', collections.Counter(f['gen_edu'] for f in final if f.get('gen_edu')))

print('water fixes', dict(WATERFIX))

# identical final name + same main key within 600 m (e.g. two generic 'Slipstelle X' nodes) -> keep one
drop_ids = set(); seen = collections.defaultdict(list)
for f in sorted(final, key=lambda f: (-f['area'], f['id'])):
    k = (f['name'], f['keys'][0])
    if any(dist(f['p'], g['p']) < 600 for g in seen[k]):
        drop_ids.add(id(f)); continue
    seen[k].append(f)
final = [f for f in final if id(f) not in drop_ids]
print('same name/key <600m dropped', len(drop_ids))

# ---------------------------------------------------------------- bus stops
GENERIC_PLACE = {'sankt', 'st', 'markt', 'bad', 'gross', 'klein', 'ober', 'unter', 'nieder', 'hohen', 'neu', 'alt', 'an', 'am', 'der',
                 'die', 'im', 'in', 'bei', 'ob', 'dem', 'den', 'des', 'zum', 'zur', 'donau', 'thaya', 'ybbs', 'leitha', 'triesting', 'wien',
                 'erlauf', 'traisen', 'pielach', 'gebirge', 'weinviertel', 'waldviertel', 'march', 'zaya', 'kamp', 'krems', 'gölsen', 'golsen'}
def place_in_name(nm, *places):
    toks = fold(nm).split()
    for pl in places:
        if not pl: continue
        if fold(pl) in fold(nm): return True
        for pt in fold(pl).replace('-', ' ').split():
            if len(pt) >= 4 and pt not in GENERIC_PLACE and any(tk.startswith(pt) or pt.startswith(tk) and len(tk) >= 4 for tk in toks):
                return True
    # river-named towns: accept the first token even if generic (e.g. "Krems Bahnhof")
    for pl in places:
        if pl:
            ft = fold(pl).split()[0]
            if len(ft) >= 4 and ft not in ('sankt', 'markt', 'gross', 'klein', 'ober', 'unter', 'nieder') and ft in toks:
                return True
    return False

BUSSTRIP = re.compile(r'\b(bahnhof|bhf|hbf|hauptbahnhof|bahnhst|bahnhaltestelle|haltestelle|hst|station|bahnhofsplatz|bahnhofplatz|vorplatz|busbahnhof|bushaltestelle|bahnstation|bus|autobusbahnhof|nord|sud|ost|west)\b')
def bus_core(nm):
    return ' '.join(BUSSTRIP.sub(' ', core(fold(nm))).split())

bus = []
for r in bus_objs:
    g = r['g']
    p = g if g.geom_type == 'Point' else (g.centroid if g.geom_type in ('Polygon', 'MultiPolygon') else g.interpolate(0.5, normalized=True))
    if not NOEP.contains(p): continue
    bnm = r['tags']['name'].strip().replace(';', ',')
    if re.match(r'(?i)^((bus)?steig|bahnsteig|platform|perron|bucht)?\s*[a-z]?\d{0,2}[a-z]?$', bnm):
        continue  # bare platform label (A, B2, Steig 3) -> part of a bus station
    bus.append({'osm': r['t'] + str(r['id']), 'name': bnm, 'nn': core(fold(re.sub(r'\(.*?\)', ' ', bnm))), 'p': p, 'tags': r['tags'],
                'prio': (0 if r['tags'].get('highway') == 'bus_stop' else 1, 0 if r['t'] == 'n' else 1)})
bpar = list(range(len(bus)))
def bfind(x):
    while bpar[x] != x:
        bpar[x] = bpar[bpar[x]]; x = bpar[x]
    return x
BT_ = STRtree([b['p'] for b in bus])
for i, b in enumerate(bus):
    for j in BT_.query(b['p'].buffer(260 / KX)):
        if j > i and dist(b['p'], bus[j]['p']) <= 250 and (bus[j]['nn'] == b['nn'] or difflib.SequenceMatcher(None, bus[j]['nn'], b['nn']).ratio() >= 0.92):
            ri, rj = bfind(i), bfind(j)
            if ri != rj: bpar[rj] = ri
bcl = collections.defaultdict(list)
for i, b in enumerate(bus): bcl[bfind(i)].append(b)
stops = []
for members in bcl.values():
    cx = sum(m['p'].x for m in members) / len(members); cy = sum(m['p'].y for m in members) / len(members)
    pt = Point(round(cx, 6), round(cy, 6))
    if not NOEP.contains(pt):
        pt = min(members, key=lambda m: dist(m['p'], Point(cx, cy)))['p']; pt = Point(round(pt.x, 6), round(pt.y, 6))
    ort = gemeinde(pt)
    if not ort: continue
    nm = collections.Counter(m['name'] for m in members).most_common(1)[0][0]
    rep_m = min(members, key=lambda m: (m['prio'], dist(m['p'], pt)))
    loc = locality(pt, rep_m['tags']) or ort
    stops.append({'members': members, 'p': pt, 'ort': ort, 'loc': loc, 'name': nm, 'rep': rep_m, 'n': len(members)})

# skip stops that belong to a rail station / bus station row (add key there instead)
STATION_KEYS = {'bahnhof', 'haltestelle', 'busbahnhof'}
st_rows = [f for f in final if STATION_KEYS & set(f['keys'])]
STT = STRtree([f['p'] for f in st_rows]) if st_rows else None
def station_match(sp):
    best = None
    bc = bus_core(sp['name'])
    for i in STT.query(sp['p'].buffer(160 / KX)):
        f = st_rows[i]
        dd = dist(sp['p'], f['p'])
        if dd > 150: continue
        fc = bus_core(f['name'])
        ok = (not bc) or (fc and (bc == fc or bc.startswith(fc) or fc.startswith(bc)
              or difflib.SequenceMatcher(None, bc, fc).ratio() >= 0.85
              or (min(len(set(bc.split())), len(set(fc.split()))) >= 1 and (set(fc.split()) <= set(bc.split()) or set(bc.split()) <= set(fc.split())) and len(fc) >= 4)))
        if not bc and not re.search(r'bahnhof|bhf|station|haltestelle', fold(sp['name'])): ok = False
        if ok and (best is None or dd < best[0]): best = (dd, f)
    return best[1] if best else None
bus_stat = collections.Counter()
kept_stops = []
for sp in stops:
    f = station_match(sp) if STT is not None else None
    if f is not None:
        if 'bushaltestelle' not in f['keys']: f['keys'].append('bushaltestelle')
        bus_stat['merged into station row'] += 1
        continue
    kept_stops.append(sp)
# one row per stop name per locality (largest cluster wins)
byname = {}
for sp in kept_stops:
    nm = sp['name'] if place_in_name(sp['name'], sp['loc'], sp['ort']) else sp['name'] + ' (' + sp['loc'] + ')'
    sp['final_name'] = nm
    key = (fold(nm), sp['loc'])
    if key not in byname or sp['n'] > byname[key]['n']:
        if key in byname: bus_stat['same name/locality dropped'] += 1
        byname[key] = sp
    else:
        bus_stat['same name/locality dropped'] += 1
used = {(f['p'].x, f['p'].y) for f in final}
for sp in byname.values():
    pt = sp['p']
    if (pt.x, pt.y) in used:
        bus_stat['coord clash skipped'] += 1; continue
    used.add((pt.x, pt.y))
    others = [m['osm'] for m in sp['members'] if m is not sp['rep']]
    hin = 'OSM ' + sp['rep']['osm'] + (' (+%d)' % len(others) if others else '') + ' · Mittelpunkt Steige'
    if sp['final_name'] != sp['name']: hin += ' · Name ergänzt'
    final.append({'id': 'poi-' + sp['rep']['osm'], 'name': sp['final_name'], 'keys': ['bushaltestelle'], 'ort': sp['ort'], 'bez': bezirk(pt), 'p': pt,
                  'hin': hin, 'area': 0, 'loc': sp['loc'], 'tags': {}, 'gen_edu': None})
    bus_stat['stop rows'] += 1
print('bus objects', len(bus), 'clusters', len(stops), dict(bus_stat))
ids_seen = collections.Counter(f['id'] for f in final)
assert max(ids_seen.values()) == 1, [k for k, v in ids_seen.items() if v > 1][:5]

# make names unique-ish: same name in different places is fine; same name within 2km and same key -> add street
cnt = collections.Counter((f['name'], f['ort']) for f in final)
for f in final:
    if cnt[(f['name'], f['ort'])] > 1:
        st = f['tags'].get('addr:street')
        if st and st not in f['name']: f['name'] += ' (' + st + ')'

# sort keys
for f in final:
    f['keys'] = sorted(dict.fromkeys(f['keys']), key=lambda k: (0 if k == f['keys'][0] else 1, ORDER[k]))

final.sort(key=lambda f: (f['bez'] or '', f['ort'], ORDER[f['keys'][0]], f['name']))
if ARGS.debug_dir:
    pickle.dump(final, open(os.path.join(ARGS.debug_dir, 'final.pkl'), 'wb'))
with open(OUT, 'w', encoding='utf-8', newline='') as fo:
    fo.write('id;name;typ;ort;breitengrad;laengengrad;hinweis\n')
    for f in final:
        vals = [f['id'], f['name'], ','.join(f['keys']), f['ort'], '%.6f' % f['p'].y, '%.6f' % f['p'].x, f['hin']]
        vals = [v.replace(';', ',').replace('\n', ' ').replace('"', "'") for v in vals]
        fo.write(';'.join(vals) + '\n')
print('written', len(final))
c = collections.Counter(k for f in final for k in f['keys'])
for k in ALLKEYS: print(f'{k:24s}{c[k]}')
