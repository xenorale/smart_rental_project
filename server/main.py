import asyncio
import json
import os
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .catalog import CATALOG, PLACES
from .live_routes import YANDEX_KEY
from .places import suggest
from .property_notes import notes_for
from .routing import DATA
from .search import DISTRICTS, Search, find_homes

ROOT = Path(__file__).resolve().parents[1]
MODEL = os.getenv("RENTAL_MODEL", "qwen2.5:1.5b")
OLLAMA = os.getenv("RENTAL_OLLAMA_URL", "http://127.0.0.1:11435")
model_lock = asyncio.Lock()
summaries = {}
app = FastAPI(title="Ближе")


@app.get("/api/config")
def config():
    return {"places": PLACES, "districts": DISTRICTS, "model": MODEL, "traffic_configured": bool(YANDEX_KEY)}


@app.get("/api/places")
def places(q: str = Query(max_length=80, default="")):
    return suggest(q)



@app.get("/api/map")
def map_data():
    return FileResponse(
        DATA / "voronezh-map.json.gz",
        media_type="application/json",
        headers={"Content-Encoding": "gzip", "Cache-Control": "public, max-age=86400"},
    )


@app.post("/api/search")
def search(query: Search):
    return find_homes(query)


@app.get("/api/homes/{home_id}")
def details(home_id: str):
    home = CATALOG.get(home_id)
    if home is None:
        raise HTTPException(404, "Такой квартиры нет")
    return {"sections": notes_for(home)}



SUMMARY_SCHEMA = {
    "type": "object",
    "required": ["pros", "cons"],
    "properties": {
        key: {"type": "array", "items": {
            "type": "object", "required": ["source", "quote"],
            "properties": {"source": {"type": "integer"}, "quote": {"type": "string"}},
            "additionalProperties": False,
        }} for key in ("pros", "cons")
    },
    "additionalProperties": False,
}


def verified_quotes(payload, reviews):
    result = {"pros": [], "cons": []}
    seen = set()
    for key in result:
        for item in payload.get(key, [])[:3]:
            source, quote = item["source"], item["quote"].strip()
            if 1 <= source <= len(reviews) and len(quote) >= 8 and quote in reviews[source - 1] and source not in seen:
                result[key].append({"source": source, "quote": quote})
                seen.add(source)
    return result


@app.post("/api/homes/{home_id}/summary")
async def summary(home_id: str, scope: Literal["flat", "building", "district"] = "building"):
    if home_id not in CATALOG:
        raise HTTPException(404, "Такой квартиры нет")
    key = (home_id, scope)
    async with model_lock:
        if key in summaries:
            return summaries[key]
        reviews = notes_for(CATALOG[home_id])[scope]["reviews"]
        text = "\n".join(f"{index}. {review}" for index, review in enumerate(reviews, 1))
        try:
            async with httpx.AsyncClient(timeout=55, trust_env=False) as client:
                response = await client.post(f"{OLLAMA}/api/chat", json={
                    "model": MODEL,
                    "stream": False,
                    "keep_alive": 0,
                    "format": SUMMARY_SCHEMA,
                    "options": {"num_gpu": 0, "num_thread": 4, "num_ctx": 2048, "num_predict": 300, "temperature": 0},
                    "messages": [
                        {"role": "system", "content": "Распредели исходные отзывы в pros (плюсы) и cons (минусы). В каждом пункте укажи source (номер отзыва) и quote (дословное предложение на русском). Скопируй предложения точно, без пересказа. Каждый отзыв используй один раз. Формат JSON."},
                        {"role": "user", "content": text},
                    ],
                })
                response.raise_for_status()
            payload = json.loads(response.json()["message"]["content"])
            result = verified_quotes(payload, reviews)
            if not result["pros"] and not result["cons"]:
                raise ValueError("No verified excerpts")
        except httpx.HTTPError as error:
            raise HTTPException(503, "Локальная модель недоступна. Исходные отзывы можно прочитать ниже") from error
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            raise HTTPException(502, "Модель не вернула проверяемые цитаты. Исходные отзывы доступны ниже") from error
        summaries[key] = {**result, "model": MODEL}
        return summaries[key]


if (ROOT / "dist").is_dir():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="web")
