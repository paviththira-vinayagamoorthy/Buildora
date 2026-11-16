import base64
import warnings
from io import BytesIO

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserResponse


router = APIRouter(
    prefix="/auth",
    tags=["Profile"],
)

MAX_FILE_SIZE = 2 * 1024 * 1024
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


async def prepare_photo(photo: UploadFile) -> str:
    try:
        raw = await photo.read(MAX_FILE_SIZE + 1)

        if not raw:
            raise HTTPException(
                status_code=400,
                detail="Choose an image file.",
            )

        if len(raw) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail="Profile photo must be 2 MB or smaller.",
            )

        with warnings.catch_warnings():
            warnings.simplefilter(
                "error",
                Image.DecompressionBombWarning,
            )

            with Image.open(BytesIO(raw)) as source:
                if source.format not in ALLOWED_FORMATS:
                    raise HTTPException(
                        status_code=400,
                        detail="Use a JPG, PNG or WebP image.",
                    )

                if source.width * source.height > 20_000_000:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Choose an image smaller than "
                            "20 megapixels."
                        ),
                    )

                source.load()

                oriented = ImageOps.exif_transpose(source)

                image = ImageOps.fit(
                    oriented.convert("RGBA"),
                    (256, 256),
                    method=Image.Resampling.LANCZOS,
                )

                background = Image.new(
                    "RGB",
                    image.size,
                    "#fffaf3",
                )

                background.paste(
                    image,
                    mask=image.getchannel("A"),
                )

                output = BytesIO()

                background.save(
                    output,
                    format="JPEG",
                    quality=80,
                    optimize=True,
                )

        encoded = base64.b64encode(
            output.getvalue()
        ).decode("ascii")

        result = f"data:image/jpeg;base64,{encoded}"

        if len(result) > 60_000:
            raise HTTPException(
                status_code=400,
                detail="Choose a simpler profile image.",
            )

        return result

    except HTTPException:
        raise

    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "This image could not be read. "
                "Choose another image."
            ),
        )

    finally:
        await photo.close()


@router.post(
    "/me/details",
    response_model=UserResponse,
)
async def save_profile_details(
    full_name: str = Form(...),
    remove_photo: bool = Form(False),
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = " ".join(full_name.split())

    if not 2 <= len(name) <= 100 or not any(
        character.isalpha() for character in name
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Enter a name containing letters, "
                "between 2 and 100 characters."
            ),
        )

    if not current_user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Account is inactive.",
        )

    if photo is not None and remove_photo:
        raise HTTPException(
            status_code=400,
            detail=(
                "Choose either a new photo "
                "or remove photo."
            ),
        )

    prepared_photo = None

    if photo is not None:
        prepared_photo = await prepare_photo(photo)

    try:
        current_user.full_name = name

        if prepared_photo is not None:
            current_user.photo_data = prepared_photo
        elif remove_photo:
            current_user.photo_data = None

        db.commit()
        db.refresh(current_user)

        return current_user

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to save your profile. "
                "Please try again."
            ),
        )