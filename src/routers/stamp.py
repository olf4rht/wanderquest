from __future__ import annotations

import uuid
import io
from fastapi import APIRouter, UploadFile, HTTPException
from PIL import Image

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
        img = Image.open(io.BytesIO(contents))
        img.verify()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    image_id = str(uuid.uuid4())
    _image_store[image_id] = contents
    return {"image_id": image_id}


def get_image(image_id: str) -> bytes | None:
    return _image_store.get(image_id)
