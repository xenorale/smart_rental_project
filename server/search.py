import math
from functools import lru_cache
from typing import Literal

from pydantic import BaseModel, Field, model_validator
from shapely.geometry import box

from .catalog import CATALOG
from .live_routes import driving_times
from .routing import EAST, NORTH, SOUTH, WEST, geojson, road_graph

DISTRICTS = sorted({home["district"] for home in CATALOG.values()})


class Destination(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    lat: float = Field(ge=SOUTH, le=NORTH)
    lon: float = Field(ge=WEST, le=EAST)
    limit: int = Field(ge=1, le=90)
    mode: Literal["walk", "car"]


class MapArea(BaseModel):
    south: float = Field(ge=SOUTH, le=NORTH)
    west: float = Field(ge=WEST, le=EAST)
    north: float = Field(ge=SOUTH, le=NORTH)
    east: float = Field(ge=WEST, le=EAST)

    @model_validator(mode="after")
    def ordered(self):
        if self.south >= self.north or self.west >= self.east:
            raise ValueError("Некорректная область карты")
        return self


class Search(BaseModel):
    points: list[Destination] = Field(default_factory=list, max_length=3)
    area: MapArea | None = None
    district: str | None = None
    price_min: int | None = Field(default=None, ge=0)
    price_max: int | None = Field(default=None, ge=0)
    rooms: list[Literal[0, 1, 2, 3, 4]] = Field(default_factory=list, max_length=5)
    size_min: int | None = Field(default=None, ge=0)
    size_max: int | None = Field(default=None, ge=0)
    floor_min: int | None = Field(default=None, ge=1)
    floor_max: int | None = Field(default=None, ge=1)
    no_first: bool = False
    no_last: bool = False
    no_commission: bool = False

    @model_validator(mode="after")
    def ordered(self):
        for low, high in ((self.price_min, self.price_max), (self.size_min, self.size_max), (self.floor_min, self.floor_max)):
            if low is not None and high is not None and low > high:
                raise ValueError("Нижняя граница выше верхней")
        if self.district and self.district not in DISTRICTS:
            raise ValueError("Неизвестный район")
        return self


def within(value, low, high):
    return (low is None or value >= low) and (high is None or value <= high)


def matches(home, query):
    return (
        within(home["price"], query.price_min, query.price_max)
        and within(home["area"], query.size_min, query.size_max)
        and within(home["floor_number"], query.floor_min, query.floor_max)
        and (not query.rooms or min(home["rooms"], 4) in query.rooms)
        and (not query.district or home["district"] == query.district)
        and (not query.no_first or home["floor_number"] != 1)
        and (not query.no_last or home["floor_number"] != home["floors"])
        and (not query.no_commission or home["commission"] == 0)
        and (
            not query.area
            or query.area.south <= home["lat"] <= query.area.north and query.area.west <= home["lon"] <= query.area.east
        )
    )


@lru_cache(maxsize=12)
def local_routes(points):
    if not points:
        return [], None, {}
    graph = road_graph()
    reachable = [graph.times_to(lat, lon, mode, limit * 60) for lat, lon, mode, limit in points]
    areas = [graph.area(mode, distances, limit * 60) for (_, _, mode, limit), distances in zip(points, reachable)]
    overlap = areas[0]
    for area in areas[1:]:
        overlap = overlap.intersection(area)
    local = {
        home_id: [graph.time_from(home["lat"], home["lon"], mode, distances) for (_, _, mode, _), distances in zip(points, reachable)]
        for home_id, home in CATALOG.items()
    }
    return areas, overlap, local


def find_homes(query: Search):
    points = tuple((round(p.lat, 6), round(p.lon, 6), p.mode, p.limit) for p in query.points)
    areas, overlap, local = local_routes(points)
    candidates = [home for home in CATALOG.values() if matches(home, query)]
    car_indices = [index for index, point in enumerate(points) if point[2] == "car"]
    live, source = driving_times(list(CATALOG.values()), [(points[index][0], points[index][1]) for index in car_indices]) if candidates else (None, "local")
    current = dict(zip(CATALOG, live)) if live is not None else {}
    if query.area:
        boundary = box(query.area.west, query.area.south, query.area.east, query.area.north)
        areas = [area.intersection(boundary) for area in areas]
        overlap = overlap.intersection(boundary) if overlap is not None else None

    listings = []
    for home in candidates:
        seconds = list(local.get(home["id"], []))
        if home["id"] in current:
            for index, duration in zip(car_indices, current[home["id"]]):
                seconds[index] = duration
        if all(value is not None and value <= point[3] * 60 for value, point in zip(seconds, points)):
            listings.append({**home, "times": [math.ceil(value / 60) for value in seconds]})

    return {
        "areas": [geojson(area) for area in areas], "overlap": geojson(overlap), "listings": listings,
        "route_source": source, "property_matches": len(candidates),
    }
