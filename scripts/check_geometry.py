"""Check the exterior mask and all generated political-area geometries."""
import json
from pathlib import Path
from shapely.geometry import shape, Point
from shapely.ops import unary_union
p=Path(__file__).resolve().parents[1]/'public/data/geo'
def geometries(name):
    return [shape(f['geometry']) for f in json.loads((p/name).read_text())['features']]
territory=unary_union(geometries('departement-95.geojson'))
mask=unary_union(geometries('masque-95.geojson'))
assert territory.is_valid and mask.is_valid
assert territory.intersection(mask).area < 1e-10
assert mask.contains(Point(2.35,48.85)), 'Paris must be masked'
assert not mask.contains(territory.representative_point()), 'Department must remain visible'
for name,count in [('communes-95.geojson',183),('circonscriptions-95.geojson',10),('cantons-95.geojson',21)]:
    shapes=geometries(name)
    assert len(shapes)==count, (name,len(shapes))
    assert all(g.is_valid and not g.is_empty for g in shapes),name
print('Masque extérieur et géométries : contrôles réussis.')
