from __future__ import annotations

import uuid
import io as _io
from fastapi import APIRouter, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from PIL import Image
from src.stamp_generator import generate_stamp, StampConfig

router = APIRouter(prefix="/api")

# In-memory store for uploaded images (session-scoped, no persistence needed)
_image_store: dict[str, bytes] = {}

ALLOWED_CONTENT_TYPES = {
    "image/png", "image/jpeg", "image/jpg", "image/webp",
    "image/heic", "image/heif", "image/svg+xml",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload")
async def upload_photo(file: UploadFile):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="File must be PNG, JPEG, or WebP")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    # SVG: rasterize to PNG before storing
    if file.content_type == "image/svg+xml":
        try:
            import cairosvg
            png_bytes = cairosvg.svg2png(bytestring=contents, output_width=1080, output_height=1080)
            contents = png_bytes
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid SVG file")
    else:
        # Validate it's actually a raster image
        try:
            img = Image.open(_io.BytesIO(contents))
            img.verify()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid image file")

    image_id = str(uuid.uuid4())
    _image_store[image_id] = contents
    return {"image_id": image_id}


def get_image(image_id: str) -> bytes | None:
    return _image_store.get(image_id)


class GenerateRequest(BaseModel):
    image_id: str
    shape: str = "oval"
    date_enabled: bool = False
    date_layout: int = 1
    date_start: str = ""
    date_end: str = ""
    ink_density: float = 0.50
    wear: float = 0.30
    edge_bleed: float = 0.20
    line_thickness: int = 2
    subject_scale: float = 0.50
    threshold_level: int = 75
    edge_strength: float = 0.70
    black_point: int = 0
    white_point: int = 255
    invert: bool = False
    canvas_width: int = 1080
    canvas_height: int = 1080


@router.post("/generate")
async def generate(request: GenerateRequest):
    image_bytes = get_image(request.image_id)
    if image_bytes is None:
        raise HTTPException(status_code=404, detail="Image not found. Upload first.")

    config = StampConfig(
        shape=request.shape,
        date_enabled=request.date_enabled,
        date_layout=request.date_layout,
        date_start=request.date_start,
        date_end=request.date_end,
        ink_density=request.ink_density,
        wear=request.wear,
        edge_bleed=request.edge_bleed,
        line_thickness=request.line_thickness,
        subject_scale=request.subject_scale,
        threshold_level=request.threshold_level,
        edge_strength=request.edge_strength,
        black_point=request.black_point,
        white_point=request.white_point,
        invert=request.invert,
        canvas_width=request.canvas_width,
        canvas_height=request.canvas_height,
    )

    import logging
    logger = logging.getLogger(__name__)
    try:
        result = generate_stamp(image_bytes, config)
    except Exception as e:
        logger.exception("Stamp generation failed")
        raise HTTPException(status_code=500, detail=str(e))

    buf = _io.BytesIO()
    result.save(buf, format="PNG")
    buf.seek(0)

    return StreamingResponse(buf, media_type="image/png")
