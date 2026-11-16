import argparse
import gzip
import json
import math
from collections import defaultdict
from pathlib import Path

import osmium
from shapely.geometry import box, mapping, shape
from shapely.errors import GEOSException

SOUTH, WEST, NORTH, EAST = 51.611, 39.116, 51.737, 39.300
WINDOW = box(WEST, SOUTH, EAST, NORTH)
DATA = Path(__file__).resolve().parents[1] / "data"
MAJOR = {"motorway": 75, "trunk": 55, "primary": 47, "secondary": 39, "tertiary": 34}
LOCAL = {"unclassified": 28, "residential": 24, "service": 16, "living_street": 14, "road": 22}
WALK_ONLY = {"footway", "pedestrian", "path", "steps", "cycleway", "track"}


def in_city(lat, lon):
    return SOUTH <= lat <= NORTH and WEST <= lon <= EAST


def write_data(name, data):
    with (DATA / name).open("wb") as file:
        file.write(gzip.compress(json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode(), mtime=0))


def line_style(highway):
    if highway in MAJOR:
        return "arterial" if highway in {"motorway", "trunk", "primary"} else "main"
    return "street" if highway in LOCAL else "path"


class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.points = []
        self.indices = {}
        self.edges = []
        self.lines = defaultdict(list)
        self.areas = []
        self.addresses = {}
        self.amenities = []
        self.factory = osmium.geom.GeoJSONFactory()

    def add_node(self, osm_id, lat, lon):
        if osm_id not in self.indices:
            self.indices[osm_id] = len(self.points)
            self.points.append([round(lat, 6), round(lon, 6)])
        return self.indices[osm_id]

    def address(self, tags, lat, lon):
        street = tags.get("addr:street")
        number = tags.get("addr:housenumber")
        if street and number and in_city(lat, lon):
            self.addresses.setdefault(f"{street}, {number}", [round(lat, 6), round(lon, 6)])

    @staticmethod
    def amenity_kind(tags):
        if tags.get("highway") == "bus_stop" or tags.get("public_transport") == "stop_position":
            return "stop"
        if tags.get("leisure") == "park":
            return "park"
        if tags.get("shop") in {"supermarket", "convenience"}:
            return "shop"
        return None

    def add_amenity(self, kind, tags, lat, lon, osm_type, osm_id):
        name = tags.get("name")
        if name and in_city(lat, lon):
            self.amenities.append([kind, name, round(lat, 6), round(lon, 6), osm_type, osm_id])

    def node(self, node):
        tags = node.tags
        kind = self.amenity_kind(tags)
        if node.location.valid() and (kind or tags.get("addr:housenumber")):
            if kind:
                self.add_amenity(kind, tags, node.lat, node.lon, "node", node.id)
            self.address(tags, node.lat, node.lon)

    def way(self, way):
        tags = way.tags
        kind = self.amenity_kind(tags)
        if kind or (tags.get("addr:street") and tags.get("addr:housenumber")):
            points = [(node.lat, node.lon) for node in way.nodes if node.location.valid()]
            if points:
                lat = sum(point[0] for point in points) / len(points)
                lon = sum(point[1] for point in points) / len(points)
                self.address(tags, lat, lon)
                if kind:
                    self.add_amenity(kind, tags, lat, lon, "way", way.id)
        highway = tags.get("highway", "").removesuffix("_link")
        railway = tags.get("railway") == "rail"
        if highway not in MAJOR and highway not in LOCAL and highway not in WALK_ONLY and not railway:
            return
        nodes = [(node.ref, node.lat, node.lon) for node in way.nodes if node.location.valid()]
        if not any(in_city(lat, lon) for _, lat, lon in nodes):
            return

        style = "rail" if railway else line_style(highway)
        segment = []
        for _, lat, lon in nodes:
            if in_city(lat, lon):
                segment.append([round(lon, 6), round(lat, 6)])
            else:
                if len(segment) > 1:
                    self.lines[style].append(segment)
                segment = []
        if len(segment) > 1:
            self.lines[style].append(segment)
        if railway or tags.get("area") == "yes":
            return

        access = tags.get("access")
        speed = MAJOR.get(highway) or LOCAL.get(highway, 0)
        foot = tags.get("foot")
        motor = tags.get("motor_vehicle", tags.get("motorcar"))
        walkable = foot in {"yes", "designated", "permissive"} or (
            foot not in {"no", "private"} and access not in {"no", "private"} and highway not in {"motorway", "trunk"}
        )
        driveable = bool(speed) and motor not in {"no", "private"} and (access not in {"no", "private"} or motor == "yes")
        direction = tags.get("oneway")
        if direction is None and (tags.get("junction") == "roundabout" or highway == "motorway"):
            direction = "yes"
        if not (walkable or driveable):
            return

        for (a_id, ay, ax), (b_id, by, bx) in zip(nodes, nodes[1:]):
            if not in_city(ay, ax) or not in_city(by, bx) or a_id == b_id:
                continue
            meters = math.hypot((ay - by) * 111_190, (ax - bx) * 69_000)
            walk = max(1, round(meters * 3.6 / (2.4 if highway == "steps" else 4.8))) if walkable else 0
            drive = max(1, round(meters * 3.6 / speed)) if driveable else 0
            a = self.add_node(a_id, ay, ax)
            b = self.add_node(b_id, by, bx)
            forward = drive if direction != "-1" else 0
            backward = drive if direction not in {"yes", "true", "1"} else 0
            self.edges.append([a, b, walk, forward, backward])

    def area(self, area):
        tags = area.tags
        natural = tags.get("natural")
        if natural == "water" or tags.get("waterway") == "riverbank":
            style = "water"
        elif natural == "wood" or tags.get("leisure") == "park" or tags.get("landuse") in {"forest", "recreation_ground"}:
            style = "park"
        else:
            return
        if not any(in_city(node.lat, node.lon) for ring in area.outer_rings() for node in ring if node.location.valid()):
            return
        try:
            geometry = shape(json.loads(self.factory.create_multipolygon(area)))
            geometry = geometry.buffer(0).intersection(WINDOW).simplify(0.00007)
        except (RuntimeError, GEOSException):
            return
        if not geometry.is_empty and geometry.area > 0.0000006:
            self.areas.append({"type": "Feature", "properties": {"style": style}, "geometry": mapping(geometry)})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pbf", type=Path)
    args = parser.parse_args()
    DATA.mkdir(exist_ok=True)
    extract = Extract()
    extract.apply_file(str(args.pbf), locations=True, idx="flex_mem")
    streets = [
        {"type": "Feature", "properties": {"style": style}, "geometry": {"type": "MultiLineString", "coordinates": lines}}
        for style, lines in extract.lines.items()
    ]
    write_data("voronezh-map.json.gz", {"type": "FeatureCollection", "features": extract.areas + streets})
    write_data("voronezh-graph.json.gz", {"points": extract.points, "edges": extract.edges})
    write_data("voronezh-addresses.json.gz", [[name, *point] for name, point in sorted(extract.addresses.items())])
    write_data("voronezh-amenities.json.gz", extract.amenities)
    print(f"{len(extract.points)} nodes, {len(extract.edges)} edges, {len(extract.areas)} areas")


if __name__ == "__main__":
    main()
