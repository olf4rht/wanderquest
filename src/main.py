from __future__ import annotations

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from src.routers.stamp import router as stamp_router

app = FastAPI(title="WanderQuest Stamp Generator")
app.include_router(stamp_router)

static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def serve_index():
    return FileResponse(os.path.join(static_dir, "index.html"))
