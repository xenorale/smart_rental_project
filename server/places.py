import gzip
import json
import re
from functools import lru_cache

from .catalog import PLACES
from .routing import DATA


def words(text):
    return re.findall(r"[а-яa-z0-9]+", text.casefold().replace("ё", "е"))


@lru_cache(maxsize=1)
def address_index():
    path = DATA / "voronezh-addresses.json.gz"
    if not path.exists():
        return []
    with gzip.open(path, "rt", encoding="utf-8") as file:
        rows = json.load(file)
    return [(name, lat, lon, words(name)) for name, lat, lon in rows]


def suggest(query, limit=10):
    tokens = words(query)
    candidates = [
        (place, words(place["name"] + " " + place["hint"])) for place in PLACES
    ]
    if not tokens:
        return PLACES[:limit]

    def matches(terms):
        return all(any(term.startswith(query_word) for term in terms) for query_word in tokens)

    found = [place for place, terms in candidates if matches(terms)]
    names = {" ".join(words(place["name"])) for place in found}
    for index, (name, lat, lon, terms) in enumerate(address_index()):
        if len(found) >= limit:
            break
        if matches(terms) and " ".join(terms) not in names:
            found.append({"id": f"address-{index}", "name": name, "hint": "Воронеж · OpenStreetMap", "lat": lat, "lon": lon})
    return found[:limit]
