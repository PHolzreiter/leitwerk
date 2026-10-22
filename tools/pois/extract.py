"""Extract candidate POIs + admin boundaries from an NÖ PBF into a pickle.

Usage: python3 -I extract.py INPUT.osm.pbf OUTPUT.pkl
(NÖ extract e.g. https://osm.download.movisda.io/admin/AT-3-latest.osm.pbf)
"""
import sys, pickle, math
import osmium
from shapely import wkb as swkb
from shapely.geometry import Point

if len(sys.argv) != 3:
    sys.exit('usage: extract.py INPUT.osm.pbf OUTPUT.pkl')
pbf, out = sys.argv[1], sys.argv[2]

KEYS = ['amenity', 'social_facility', 'healthcare', 'railway', 'highway', 'shop', 'leisure',
        'landuse', 'man_made', 'tourism', 'historic', 'craft', 'power', 'aeroway', 'sport',
        'boundary', 'building', 'office', 'club', 'aerialway', 'natural', 'attraction', 'place', 'waterway']

AMEN = {'nursing_home', 'social_facility', 'kindergarten', 'childcare', 'school', 'college',
        'university', 'doctors', 'clinic', 'hospital', 'cinema', 'theatre', 'arts_centre',
        'events_venue', 'concert_hall', 'community_centre', 'nightclub', 'public_bath',
        'restaurant', 'bar', 'pub', 'biergarten', 'wine_bar', 'parking', 'conference_centre',
        'exhibition_centre', 'music_venue', 'stage', 'social_centre', 'cafe', 'fast_food',
        'swimming_pool', 'townhall', 'monastery', 'place_of_worship', 'driver_training',
        'dancing_school'}
LEIS = {'pitch', 'sports_centre', 'stadium', 'sports_hall', 'fitness_centre', 'horse_riding',
        'golf_course', 'ice_rink', 'swimming_pool', 'water_park', 'bathing_place', 'beach_resort',
        'track', 'amusement_arcade', 'miniature_golf', 'adventure_park', 'climbing', 'fitness_station',
        'resort', 'swimming_area', 'outdoor_seating', 'trampoline_park', 'escape_game', 'dance',
        'wildlife_hide', 'nature_reserve', 'bowling_alley', 'park', 'sauna', 'horse_riding_hall'}
SHOP = {'supermarket', 'mall', 'doityourself', 'hardware', 'furniture', 'garden_centre',
        'agrarian', 'department_store', 'wholesale', 'farm', 'country_store', 'trade',
        'building_materials', 'convenience', 'wine'}
TOUR = {'theme_park', 'zoo', 'museum', 'camp_site', 'attraction', 'viewpoint', 'hotel',
        'caravan_site', 'aquarium', 'gallery', 'wine_cellar', 'resort', 'apartment', 'alpine_hut'}
HIST = {'castle', 'ruins', 'monastery', 'fort', 'palace', 'manor', 'castle_wall', 'city_gate', 'tower', 'memorial', 'archaeological_site'}
MAN = {'works', 'tower', 'silo', 'observation_tower', 'mineshaft', 'wastewater_plant', 'water_works', 'storage_tank'}
LANDUSE = {'retail', 'winter_sports', 'quarry', 'industrial', 'landfill', 'recreation_ground', 'religious', 'farmyard'}


def interesting(t):
    g = t.get
    if g('boundary') == 'administrative' and g('admin_level') in ('4', '6', '8'):
        return True
    if g('amenity') in AMEN: return True
    if 'social_facility' in t or 'healthcare' in t: return True
    if g('railway') in ('station', 'halt'): return True
    if g('highway') == 'services' or g('highway') == 'rest_area': return True
    if g('shop') in SHOP: return True
    if g('leisure') in LEIS: return True
    if g('landuse') in LANDUSE: return True
    if g('man_made') in MAN: return True
    if g('tourism') in TOUR: return True
    if g('historic') in HIST: return True
    if g('craft') in ('sawmill', 'winery', 'carpenter'): return True
    if g('power') == 'plant': return True
    if g('aeroway') in ('aerodrome', 'heliport', 'airstrip', 'helipad'): return True
    if g('aerialway') in ('station',): return True
    if 'sport' in t and g('name'): return True
    if g('building') in ('school', 'kindergarten', 'train_station', 'industrial', 'hotel', 'stadium', 'sports_hall', 'riding_hall', 'nursing_home') and g('name'): return True
    if g('office') and g('name'): return True
    if g('natural') == 'water' and g('name'): return True
    if g('club') and g('name'): return True
    if g('attraction'): return True
    if g('place') in ('city', 'town', 'village', 'hamlet', 'suburb', 'isolated_dwelling', 'locality', 'neighbourhood', 'quarter') and g('name'): return True
    if g('natural') in ('gorge', 'cave_entrance', 'peak') and g('name'): return True
    if g('waterway') == 'waterfall' and g('name'): return True
    if g('barrier') == 'gate' or 'entrance' in t: return True
    return False


wkbf = osmium.geom.WKBFactory()
recs = []
admin = []
proc = (osmium.FileProcessor(pbf)
        .with_locations()
        .with_areas(osmium.filter.KeyFilter(*[k for k in KEYS if k not in ('place','waterway')]))
        .with_filter(osmium.filter.EmptyTagFilter()))
n = 0
for o in proc:
    n += 1
    t = dict(o.tags)
    if not interesting(t):
        continue
    try:
        if o.is_node():
            g = Point(o.location.lon, o.location.lat)
            typ, oid = 'n', o.id
        elif o.is_area():
            g = swkb.loads(wkbf.create_multipolygon(o), hex=True)
            typ = 'w' if o.from_way() else 'r'
            oid = o.orig_id()
        elif o.is_way():
            # non-closed ways (closed ones come as areas): keep only some
            if o.is_closed():
                continue
            if not (t.get('railway') in ('station', 'halt') or t.get('highway') == 'services' or t.get('aeroway') in ('airstrip',) or t.get('leisure') in ('track',)):
                continue
            g = swkb.loads(wkbf.create_linestring(o), hex=True)
            typ, oid = 'w', o.id
        else:
            continue  # plain relations (non-area) skipped
    except Exception as e:
        continue
    r = {'t': typ, 'id': oid, 'tags': t, 'g': g}
    if t.get('boundary') == 'administrative' and t.get('admin_level') in ('4', '6', '8') and typ != 'n':
        admin.append(r)
        if not (t.get('amenity') or t.get('leisure')):
            continue
    recs.append(r)
print('objects seen', n, 'candidates', len(recs), 'admin', len(admin))
pickle.dump({'recs': recs, 'admin': admin}, open(out, 'wb'))
