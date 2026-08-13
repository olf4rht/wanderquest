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

ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload")
async def upload_photo(file: UploadFile):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="File must be PNG, JPEG, or WebP")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    # Validate it's actually an image
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
    color: list[int]  # [R, G, B]
    shape: str = "circle"
    border_style: str = "single"
    border_thickness: int = 3
    primary_text: str = ""
    secondary_text: str = ""
    font: str = "serif"
    text_placement: str = "below"
    ink_density: float = 0.5
    wear: float = 0.3
    edge_bleed: float = 0.2
    line_thickness: int = 2
    subject_scale: float = 0.5
    background: str = "transparent"
    output_size: int = 512


@router.post("/generate")
async def generate(request: GenerateRequest):
    image_bytes = get_image(request.image_id)
    if image_bytes is None:
        raise HTTPException(status_code=404, detail="Image not found. Upload first.")

    config = StampConfig(
        color=tuple(request.color),
        shape=request.shape,
        border_style=request.border_style,
        border_thickness=request.border_thickness,
        primary_text=request.primary_text,
        secondary_text=request.secondary_text,
        font=request.font,
        text_placement=request.text_placement,
        ink_density=request.ink_density,
        wear=request.wear,
        edge_bleed=request.edge_bleed,
        line_thickness=request.line_thickness,
        subject_scale=request.subject_scale,
        background=request.background,
        output_size=request.output_size,
    )

    result = generate_stamp(image_bytes, config)

    buf = _io.BytesIO()
    result.save(buf, format="PNG")
    buf.seek(0)

    return StreamingResponse(buf, media_type="image/png")
