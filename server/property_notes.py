import gzip
import json
import math
from functools import lru_cache

from .catalog import reviews_for
from .routing import DATA

FLAT_REVIEWS = [
    ["В квартире есть мебель и стиральная машина.", "В комнате хороший дневной свет.", "На кухне мало места для хранения."],
    ["На кухне есть духовка и вытяжка.", "В спальне достаточно места для шкафа.", "В прихожей нет отдельной гардеробной."],
    ["Санузел после ремонта, сантехника работает.", "На балконе можно хранить велосипед.", "Окна в комнате выходят на оживлённую улицу."],
]

DISTRICT_REVIEWS = {
    "Центральный": ["До магазинов и кафе можно дойти пешком.", "Рядом несколько остановок транспорта.", "Вечером у крупных торговых центров сложно припарковаться."],
    "Коминтерновский": ["В районе много продуктовых магазинов.", "До парка можно добраться пешком.", "В час пик на основных улицах бывает плотное движение."],
    "Левобережный": ["Рядом с набережной есть прогулочные дорожки.", "До продуктового магазина можно дойти пешком.", "Дорога в центр зависит от загруженности мостов."],
    "Железнодорожный": ["В районе есть небольшие парки.", "Рядом есть остановки городских автобусов.", "Дорога до центра в час пик занимает больше времени."],
    "Ленинский": ["В шаговой доступности есть магазины и аптеки.", "Внутри кварталов есть дворы для прогулок.", "Вдоль крупных улиц бывает шумно."],
    "Советский": ["В районе есть зелёные зоны для прогулок.", "Рядом есть магазины и остановки.", "В часы пик поездка в центр может занимать больше времени."],
}


@lru_cache(maxsize=1)
def amenities():
    with gzip.open(DATA / "voronezh-amenities.json.gz", "rt", encoding="utf-8") as file:
        return json.load(file)


@lru_cache(maxsize=64)
def nearby(lat, lon):
    closest = {}
    for kind, name, y, x, osm_type, osm_id in amenities():
        meters = math.hypot((lat - y) * 111_190, (lon - x) * 69_000)
        if meters <= 1500 and (kind not in closest or meters < closest[kind][0]):
            closest[kind] = (meters, name, osm_type, osm_id)
    result = []
    for kind, label in (("stop", "Остановка"), ("shop", "Продуктовый магазин"), ("park", "Парк")):
        if kind in closest:
            meters, name, osm_type, osm_id = closest[kind]
            result.append({
                "label": label,
                "value": f"{name} · около {max(10, round(meters / 10) * 10)} м",
                "osm": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
            })
    return result


def notes_for(home):
    flat_reviews = FLAT_REVIEWS[home["photo_number"] % len(FLAT_REVIEWS)]
    return {
        "flat": {
            "facts": [
                {"label": "Площадь", "value": f'{home["area"]} м²'},
                {"label": "Аренда в месяц", "value": f'{home["price"]:,} ₽'.replace(",", " ")},
                {"label": "Комиссия", "value": f'{home["commission"]}%' if home["commission"] else "Нет"},
            ],
            "reviews": flat_reviews,
        },
        "building": {
            "facts": [
                {"label": "Адрес", "value": home["address"]},
                {"label": "Этаж квартиры", "value": home["floor"]},
                {"label": "Этажей в доме", "value": str(home["floors"])},
            ],
            "reviews": reviews_for(home["id"]),
        },
        "district": {
            "facts": [{"label": "Район", "value": home["district"]}, *nearby(home["lat"], home["lon"])],
            "reviews": DISTRICT_REVIEWS.get(home["district"], []),
        },
    }
