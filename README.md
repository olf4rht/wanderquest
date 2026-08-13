# WanderQuest

WanderQuest is a web application that converts photos into rubber stamp-style images. Upload any photo and the app extracts its line art, applies customizable ink colors, adds text (straight or curved), decorative borders, and aging effects like wear, texture, and ink bleed -- producing a realistic vintage rubber stamp rendition of your image.

## Setup

```bash
git clone <repo-url> && cd wanderquest
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in the project root and set your Replicate API token:

```
REPLICATE_API_TOKEN=your_token_here
```

## Run

```bash
uvicorn src.main:app --reload
```

## Run Tests

```bash
pytest tests/ -v
```

## Project Structure

- `src/` -- FastAPI backend
  - `src/routers/` -- API endpoints
  - `src/lineart.py` -- Replicate line art extraction
  - `src/cleanup.py` -- Image cleanup pipeline
  - `src/composition.py` -- Frame/border composition
  - `src/text_renderer.py` -- Text rendering (straight + curved)
  - `src/ink_effect.py` -- Ink effects (colorize, texture, wear, bleed)
  - `src/stamp_generator.py` -- Pipeline orchestrator
- `static/` -- Frontend (HTML, CSS, JS)
- `tests/` -- Test suite
