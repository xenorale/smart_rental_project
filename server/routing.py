import gzip
import heapq
import json
import math
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

from shapely.geometry import Polygon, box, mapping, shape
from shapely.ops import unary_union

DATA = Path(__file__).resolve().parents[1] / "data"
SOUTH, WEST, NORTH, EAST = 51.611, 39.116, 51.737, 39.300
GRID_LAT, GRID_LON = 0.0015, 0.0024
SNAP_LAT, SNAP_LON = 0.002, 0.0032


class RoadGraph:
    def __init__(self, data):
        self.points = data["points"]
        self.reverse = {"walk": defaultdict(list), "car": defaultdict(list)}
        for a, b, walk, forward, backward in data["edges"]:
            if walk:
                self.reverse["walk"][a].append((b, walk))
                self.reverse["walk"][b].append((a, walk))
            if forward:
                self.reverse["car"][b].append((a, forward))
                self.reverse["car"].setdefault(a, [])
            if backward:
                self.reverse["car"][a].append((b, backward))
                self.reverse["car"].setdefault(b, [])
        self.cells = {"walk": defaultdict(list), "car": defaultdict(list)}
        for mode, edges in self.reverse.items():
            for index in edges:
                lat, lon = self.points[index]
                self.cells[mode][self.snap_cell(lat, lon)].append(index)

    @staticmethod
    def snap_cell(lat, lon):
        return int((lat - SOUTH) / SNAP_LAT), int((lon - WEST) / SNAP_LON)

    def snap(self, lat, lon, mode):
        row, col = self.snap_cell(lat, lon)
        nearest, distance = -1, 380.0
        for y in range(row - 2, row + 3):
            for x in range(col - 2, col + 3):
                for index in self.cells[mode].get((y, x), ()):
                    node_lat, node_lon = self.points[index]
                    meters = math.hypot((node_lat - lat) * 111_190, (node_lon - lon) * 69_000)
                    if meters < distance:
                        nearest, distance = index, meters
        return nearest, round(distance * 0.75)

    @lru_cache(maxsize=24)
    def times_to(self, lat, lon, mode, limit):
        root, offset = self.snap(lat, lon, mode)
        if root < 0:
            return {}
        distances = {root: offset}
        pending = [(offset, root)]
        while pending:
            seconds, node = heapq.heappop(pending)
            if seconds != distances[node]:
                continue
            for previous, cost in self.reverse[mode][node]:
                total = seconds + cost
                if total <= limit and total < distances.get(previous, math.inf):
                    distances[previous] = total
                    heapq.heappush(pending, (total, previous))
        return distances

    def time_from(self, lat, lon, mode, distances):
        node, offset = self.snap(lat, lon, mode)
        seconds = distances.get(node)
        return None if seconds is None else seconds + offset

    @lru_cache(maxsize=2)
    def grid(self, mode):
        rows = math.ceil((NORTH - SOUTH) / GRID_LAT)
        cols = math.ceil((EAST - WEST) / GRID_LON)
        return [
            [
                self.snap(SOUTH + (y + 0.5) * GRID_LAT, WEST + (x + 0.5) * GRID_LON, mode)
                for x in range(cols)
            ]
            for y in range(rows)
        ]

    def area(self, mode, distances, limit):
        strips = []
        for y, row in enumerate(self.grid(mode)):
            start = None
            for x, (node, offset) in enumerate([*row, (-1, 0)]):
                inside = distances.get(node, math.inf) + offset <= limit
                if inside and start is None:
                    start = x
                if not inside and start is not None:
                    strips.append(box(
                        WEST + start * GRID_LON, SOUTH + y * GRID_LAT,
                        WEST + x * GRID_LON, SOUTH + (y + 1) * GRID_LAT,
                    ))
                    start = None
        if not strips:
            return Polygon()
        polygon = unary_union(strips).buffer(0.00065).buffer(-0.00065)
        polygon = polygon.buffer(-0.00046).buffer(0.00046).simplify(0.00030)
        return polygon.difference(map_water())


@lru_cache(maxsize=1)
def road_graph():
    with gzip.open(DATA / "voronezh-graph.json.gz", "rt", encoding="utf-8") as file:
        return RoadGraph(json.load(file))


@lru_cache(maxsize=1)
def map_water():
    with gzip.open(DATA / "voronezh-map.json.gz", "rt", encoding="utf-8") as file:
        features = json.load(file)["features"]
    return unary_union([shape(feature["geometry"]) for feature in features if feature["properties"]["style"] == "water"])


def geojson(geometry):
    return None if geometry is None or geometry.is_empty else mapping(geometry)
