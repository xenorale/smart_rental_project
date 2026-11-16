import math
import os
import time
from functools import lru_cache

import httpx

YANDEX_KEY = os.getenv("RENTAL_YANDEX_KEY", "").strip()
MATRIX_URL = "https://api.routing.yandex.net/v2/distancematrix"


@lru_cache(maxsize=24)
def request_matrix(origins, destinations, window):
    batch_size = 100 // len(destinations)
    results = []
    with httpx.Client(timeout=6, trust_env=False) as client:
        for start in range(0, len(origins), batch_size):
            batch = origins[start:start + batch_size]
            params = {
                "apikey": YANDEX_KEY,
                "mode": "driving",
                "origins": "|".join(f"{lat},{lon}" for lat, lon in batch),
                "destinations": "|".join(f"{lat},{lon}" for lat, lon in destinations),
            }
            response = client.get(MATRIX_URL, params=params)
            response.raise_for_status()
            rows = response.json()["rows"]
            if len(rows) != len(batch):
                raise ValueError("Unexpected matrix row count")
            for row in rows:
                elements = row["elements"]
                if len(elements) != len(destinations):
                    raise ValueError("Unexpected matrix column count")
                durations = []
                for cell in elements:
                    if cell["status"] == "FAIL":
                        durations.append(None)
                    elif cell["status"] == "OK" and (seconds := cell["duration"]["value"]) >= 0 and math.isfinite(seconds):
                        durations.append(seconds)
                    else:
                        raise ValueError("Unusable duration")
                results.append(tuple(durations))
    return tuple(results)


def driving_times(homes, destinations):
    if not YANDEX_KEY or not destinations or not homes:
        return None, "local"
    origins = tuple((home["lat"], home["lon"]) for home in homes)
    try:
        return request_matrix(origins, tuple(destinations), int(time.monotonic() // 45)), "traffic"
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        return None, "fallback"
