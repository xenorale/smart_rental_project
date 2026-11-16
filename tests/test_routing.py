import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from server.catalog import CATALOG, PLACES, group_offers
from server.main import app, verified_quotes
from server.routing import RoadGraph
from server.search import Search, find_homes

PLACES_BY_ID = {place["id"]: place for place in PLACES}


def route_to(place, mode, limit):
    return {**PLACES_BY_ID[place], "mode": mode, "limit": limit}


class RoutingTests(unittest.TestCase):
    def test_one_way_direction_is_preserved(self):
        points = [[51.66, 39.20], [51.66, 39.204]]
        graph = RoadGraph({"points": points, "edges": [[0, 1, 200, 25, 0]]})
        start, end = points
        self.assertEqual(graph.time_from(*start, "car", graph.times_to(*end, "car", 100)), 25)
        self.assertIsNone(graph.time_from(*end, "car", graph.times_to(*start, "car", 100)))
        self.assertEqual(graph.time_from(*end, "walk", graph.times_to(*start, "walk", 250)), 200)

    def test_search_applies_both_route_limits(self):
        client = TestClient(app)
        points = [route_to("kolts24", "car", 20), route_to("gallery", "walk", 5)]
        result = client.post("/api/search", json={"points": points, "price_max": 45000}).json()
        self.assertTrue(result["overlap"])
        self.assertEqual([home["id"] for home in result["listings"]], ["gallery35"])
        self.assertTrue(all(value <= point["limit"] for point, value in zip(points, result["listings"][0]["times"])))
        points[1] = route_to("arena", "walk", 5)
        self.assertFalse(client.post("/api/search", json={"points": points}).json()["listings"])

    def test_traffic_eta_updates_driving_limit_only(self):
        points = [route_to("kolts24", "car", 20), route_to("gallery", "walk", 5)]
        with patch("server.search.driving_times", return_value=([(1201,)] * len(CATALOG), "traffic")):
            self.assertFalse(find_homes(Search(points=points))["listings"])
        with patch("server.search.driving_times", return_value=([(1200,)] * len(CATALOG), "traffic")):
            result = find_homes(Search(points=points))
        self.assertEqual(result["route_source"], "traffic")
        self.assertEqual(result["listings"][0]["times"][0], 20)
        self.assertLessEqual(result["listings"][0]["times"][1], 5)

    def test_search_without_routes_checks_rooms_area_floor_and_district(self):
        result = find_homes(Search(
            district="Советский", rooms=[3, 4], size_min=70, floor_min=2, no_first=True, no_last=True,
            no_commission=True, price_min=40000, price_max=45000,
        ))
        self.assertEqual([(home["id"], home["times"]) for home in result["listings"]], [("marsh", [])])

    def test_map_area_limits_candidates(self):
        result = find_homes(Search(area={"south": 51.6669, "west": 39.1916, "north": 51.6675, "east": 39.1920}))
        self.assertEqual([home["id"] for home in result["listings"]], ["gallery35"])

    def test_duplicate_offers_keep_both_prices(self):
        home = CATALOG["revol"]
        self.assertEqual([offer["price"] for offer in home["offers"]], [34500, 36500])
        other = {**home, "id": "different-flat", "floor": "7 из 8"}
        self.assertEqual(len(group_offers([(home, "А"), (other, "Б")])), 2)

    def test_unverified_quotes_are_dropped(self):
        result = verified_quotes({
            "pros": [{"source": 1, "quote": "Возле дома есть магазин"}],
            "cons": [{"source": 2, "quote": "Шумит трасса"}, {"source": 3, "quote": "Плохая парковка"}],
        }, ["Возле дома есть магазин.", "На улице тихо."])
        self.assertEqual(result, {"pros": [{"source": 1, "quote": "Возле дома есть магазин"}], "cons": []})
