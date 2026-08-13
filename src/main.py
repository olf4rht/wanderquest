from fastapi import FastAPI
from src.routers.stamp import router as stamp_router

app = FastAPI(title="WanderQuest Stamp Generator")
app.include_router(stamp_router)


@app.get("/health")
def health():
    return {"status": "ok"}
