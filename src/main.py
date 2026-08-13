from fastapi import FastAPI

app = FastAPI(title="WanderQuest Stamp Generator")


@app.get("/health")
def health():
    return {"status": "ok"}
