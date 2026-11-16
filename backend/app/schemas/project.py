import re
import unicodedata

from datetime import datetime
from typing import Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


SRI_LANKA_DISTRICTS = (
    "Ampara",
    "Anuradhapura",
    "Badulla",
    "Batticaloa",
    "Colombo",
    "Galle",
    "Gampaha",
    "Hambantota",
    "Jaffna",
    "Kalutara",
    "Kandy",
    "Kegalle",
    "Kilinochchi",
    "Kurunegala",
    "Mannar",
    "Matale",
    "Matara",
    "Monaragala",
    "Mullaitivu",
    "Nuwara Eliya",
    "Polonnaruwa",
    "Puttalam",
    "Ratnapura",
    "Trincomalee",
    "Vavuniya",
)

DISTRICT_LOOKUP = {
    district.casefold(): district
    for district in SRI_LANKA_DISTRICTS
}

JUNK_WORDS = {
    "test",
    "dummy",
    "asdf",
    "asdfgh",
    "qwerty",
    "qwertyuiop",
    "abc",
    "abcd",
    "abcde",
    "xyz",
    "xxx",
    "xxxx",
    "aaa",
    "aaaa",
    "aaaaa",
    "sample",
    "nothing",
    "none",
    "null",
    "undefined",
    "hello",
    "hi",
    "blah",
    "blabla",
    "lorem",
    "ipsum",
}


def normalize_text(value):
    if not isinstance(value, str):
        raise ValueError("Enter a valid text value.")

    value = unicodedata.normalize("NFKC", value)

    return re.sub(r"\s+", " ", value).strip()


def validate_meaningful_text(
    value: str,
    label: str,
    minimum_letters: int,
    minimum_words: int,
):
    letters = "".join(
        character
        for character in value
        if character.isalpha()
    )

    words = re.findall(
        r"[^\W\d_]+",
        value,
        flags=re.UNICODE,
    )

    if (
        len(letters) < minimum_letters
        or len(words) < minimum_words
    ):
        raise ValueError(
            f"Enter a meaningful {label}."
        )

    if any(
        word.casefold() in JUNK_WORDS
        for word in words
    ):
        raise ValueError(
            f"Enter a meaningful {label}; "
            "placeholder text is not allowed."
        )

    folded_letters = letters.casefold()

    if (
        len(set(folded_letters)) < 2
        or re.search(r"(.)\1{4,}", folded_letters)
    ):
        raise ValueError(
            f"Enter a valid {label}; "
            "repeated characters are not allowed."
        )

    return value


class ProjectCreate(BaseModel):
    cover_image: str | None = Field(default=None, max_length=2_796_240)
    name: str = Field(
        min_length=3,
        max_length=150,
    )

    location: str = Field(
        min_length=2,
        max_length=255,
    )

    description: str = Field(
        min_length=15,
        max_length=2000,
    )

    @field_validator(
        "name",
        "location",
        "description",
        mode="before",
    )
    @classmethod
    def clean_fields(cls, value):
        return normalize_text(value)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        return validate_meaningful_text(
            value=value,
            label="project name",
            minimum_letters=3,
            minimum_words=1,
        )

    
@field_validator("location")
@classmethod
def validate_location(cls, value):
    value = value.strip()

    district = DISTRICT_LOOKUP.get(value.casefold())

    if district:
        return district

    address, separator, district_name = value.rpartition(",")

    district = DISTRICT_LOOKUP.get(
        district_name.strip().casefold()
    )

    if not separator or not district or not address.strip():
        raise ValueError(
            "Select a valid Sri Lankan district and enter a valid address."
        )

    if not any(char.isalpha() for char in address):
        raise ValueError("Address must contain letters.")

    if len(value) > 255:
        raise ValueError("Location must not exceed 255 characters.")

    return f"{address.strip()}, {district}"
  

    @field_validator("description")
    @classmethod
    def validate_description(cls, value):
        return validate_meaningful_text(
            value=value,
            label=(
                "description with at least "
                "three words"
            ),
            minimum_letters=10,
            minimum_words=3,
        )


class ProjectResponse(BaseModel):
    cover_image: str | None = None
    id: int
    organization_id: int
    name: str
    location: Optional[str] = None
    description: Optional[str] = None
    status: str
    created_by: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


class ProjectMemberResponse(BaseModel):
    id: int
    user_id: int
    full_name: Optional[str] = None
    email: str
    project_role: str
    joined_at: datetime


class ProjectMemberAdd(BaseModel):
    user_id: int
    project_role: str