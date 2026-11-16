import asyncio
import json
import math
import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .catalog import CATALOG, DEFAULT_POINTS, PLACES, reviews_for
from .routing import DATA, EAST, NORTH, SOUTH, WEST, geojson, road_graph

ROOT = Path(__file__).resolve().parents[1]
MODEL = os.getenv("RENTAL_MODEL", "qwen2.5:1.5b")
OLLAMA = os.getenv("RENTAL_OLLAMA_URL", "http://127.0.0.1:11435")
model_lock = asyncio.Lock()
summaries = {}
app = FastAPI(title="Ближе")


class Destination(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    lat: float = Field(ge=SOUTH, le=NORTH)
    lon: float = Field(ge=WEST, le=EAST)
    limit: int = Field(ge=5, le=60)
    mode: Literal["walk", "car"]


class Search(BaseModel):
    points: list[Destination] = Field(min_length=1, max_length=3)
    budget: int = Field(ge=1000, le=150000)
    rooms: Literal[0, 1, 2] | None = None


@app.get("/api/config")
def config():
    return {"places": PLACES, "points": DEFAULT_POINTS, "budget": 45000, "model": MODEL}


@app.get("/api/map")
def map_data():
    return FileResponse(
        DATA / "voronezh-map.json.gz",
        media_type="application/json",
        headers={"Content-Encoding": "gzip", "Cache-Control": "public, max-age=86400"},
    )


@lru_cache(maxsize=8)
def calculate(points):
    graph = road_graph()
    reachable = [graph.times_to(lat, lon, mode, limit * 60) for lat, lon, mode, limit in points]
    areas = [
        graph.area(mode, distances, limit * 60)
        for (_, _, mode, limit), distances in zip(points, reachable)
    ]
    overlap = areas[0]
    for area in areas[1:]:
        overlap = overlap.intersection(area)
    listings = []
    for home in CATALOG.values():
        times = [
            graph.time_from(home["lat"], home["lon"], mode, distances)
            for (_, _, mode, _), distances in zip(points, reachable)
        ]
        if all(seconds is not None and seconds <= point[3] * 60 for seconds, point in zip(times, points)):
            listings.append({**home, "times": [math.ceil(seconds / 60) for seconds in times]})
    return {"areas": [geojson(area) for area in areas], "overlap": geojson(overlap), "listings": listings}


@app.post("/api/search")
def search(query: Search):
    points = tuple((round(p.lat, 5), round(p.lon, 5), p.mode, p.limit) for p in query.points)
    result = calculate(points)
    listings = [
        home for home in result["listings"]
        if home["price"] <= query.budget and (query.rooms is None or home["rooms"] == query.rooms)
    ]
    listings.sort(key=lambda home: (sum(home["times"]), home["price"]))
    return {**result, "listings": listings}


@app.get("/api/homes/{home_id}")
def details(home_id: str):
    if home_id not in CATALOG:
        raise HTTPException(404, "Такой квартиры нет")
    return {"reviews": reviews_for(home_id)}


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
async def summary(home_id: str):
    if home_id not in CATALOG:
        raise HTTPException(404, "Такой квартиры нет")
    async with model_lock:
        if home_id in summaries:
            return summaries[home_id]
        reviews = reviews_for(home_id)
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
                        {"role": "system", "content": "Распредели отзывы о доме в pros (плюсы) и cons (минусы). В каждом пункте укажи source (номер отзыва) и quote (дословное предложение на русском). Скопируй предложения точно, без пересказа. Каждый отзыв используй один раз. Формат JSON."},
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
        summaries[home_id] = {**result, "model": MODEL}
        return summaries[home_id]


if (ROOT / "dist").is_dir():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="web")
