import sys, json
from suche import suche
Q = json.loads(sys.argv[1])
alle = {}
for tag, q in Q:
    r = suche(q)
    alle[tag] = r
    print(f"## {tag} ({q})")
    for x in r[:8]: print(f'{x["id"]:>8} {x["dauer"]:7.1f}s {x["dl"]:>6} {x["user"][:14]:14} {x["titel"][:60]}')
json.dump(alle, open("treffer_%s.json" % sys.argv[2], "w"))
