import base64
from io import BytesIO

from fastapi import HTTPException
from PIL import Image, ImageOps


MAX_COVER_BYTES = 2 * 1024 * 1024
COVER_FORMATS = {
    "data:image/jpeg;base64": "JPEG",
    "data:image/png;base64": "PNG",
    "data:image/webp;base64": "WEBP",
}


def prepare_project_cover(value: str | None) -> str | None:
    if value is None:
        return None

    header, separator, encoded = value.partition(",")

    try:
        if not separator or header not in COVER_FORMATS:
            raise ValueError

        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > MAX_COVER_BYTES:
            raise ValueError

        with Image.open(BytesIO(raw)) as source:
            if source.format != COVER_FORMATS[header]:
                raise ValueError

            if source.width * source.height > 20_000_000:
                raise ValueError

            image = ImageOps.exif_transpose(source).convert("RGBA")
            image.thumbnail((960, 540), Image.Resampling.LANCZOS)

            cover = Image.new("RGB", image.size, "#f7f0ea")
            cover.paste(image, mask=image.getchannel("A"))

            output = BytesIO()
            cover.save(output, format="JPEG", quality=82, optimize=True)

    except (ValueError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(
            status_code=422,
            detail="Choose a valid JPG, PNG or WebP photo up to 2 MB and 20 megapixels.",
        ) from exc

    encoded_cover = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded_cover}"