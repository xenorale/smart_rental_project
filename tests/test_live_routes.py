import unittest
from unittest.mock import patch

import httpx

from server.live_routes import driving_times, request_matrix


class LiveRouteTests(unittest.TestCase):
    def test_matrix_reads_current_car_eta_and_route_failure(self):
        seen = []

        def respond(request):
            seen.append(request)
            return httpx.Response(200, json={"rows": [
                {"elements": [{"status": "OK", "duration": {"value": 842}}]},
                {"elements": [{"status": "FAIL"}]},
            ]})

        client = httpx.Client(transport=httpx.MockTransport(respond))
        homes = [{"lat": 51.66, "lon": 39.19}, {"lat": 51.71, "lon": 39.15}]
        try:
            with patch("server.live_routes.YANDEX_KEY", "test-key"), patch("server.live_routes.httpx.Client", return_value=client):
                self.assertEqual(driving_times(homes, [(51.67, 39.20)]), (((842,), (None,)), "traffic"))
        finally:
            request_matrix.cache_clear()
        params = seen[0].url.params
        self.assertEqual(params["mode"], "driving")
        self.assertEqual(params["origins"], "51.66,39.19|51.71,39.15")
        self.assertEqual(params["destinations"], "51.67,39.2")
        self.assertNotIn("departure_time", params)
        self.assertNotIn("traffic", params)

    def test_network_error_falls_back_to_local_estimate(self):
        request = httpx.Request("GET", "https://example.test")
        with patch("server.live_routes.YANDEX_KEY", "test-key"), patch(
            "server.live_routes.request_matrix", side_effect=httpx.ReadTimeout("timeout", request=request)
        ):
            self.assertEqual(driving_times([{"lat": 51.66, "lon": 39.19}], [(51.67, 39.2)]), (None, "fallback"))
