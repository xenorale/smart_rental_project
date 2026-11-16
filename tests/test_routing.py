import unittest

from fastapi.testclient import TestClient

from server.catalog import CATALOG, DEFAULT_POINTS, group_offers
from server.main import app, verified_quotes
from server.routing import RoadGraph


class RoutingTests(unittest.TestCase):
    def test_one_way_direction_is_preserved(self):
        points = [[51.66, 39.20], [51.66, 39.204]]
        graph = RoadGraph({"points": points, "edges": [[0, 1, 200, 25, 0]]})
        start, end = points
        self.assertEqual(graph.time_from(*start, "car", graph.times_to(*end, "car", 100)), 25)
        self.assertIsNone(graph.time_from(*end, "car", graph.times_to(*start, "car", 100)))
        self.assertEqual(graph.time_from(*end, "walk", graph.times_to(*start, "walk", 250)), 200)

    def test_search_applies_all_limits(self):
        client = TestClient(app)
        query = {"points": DEFAULT_POINTS, "budget": 33000, "rooms": 1}
        response = client.post("/api/search", json=query)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertTrue(result["overlap"])
        self.assertTrue(result["listings"])
        for home in result["listings"]:
            self.assertLessEqual(home["price"], query["budget"])
            self.assertEqual(home["rooms"], 1)
            self.assertEqual(len(home["times"]), len(DEFAULT_POINTS))
            for time, point in zip(home["times"], DEFAULT_POINTS):
                self.assertLessEqual(time, point["limit"])

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
