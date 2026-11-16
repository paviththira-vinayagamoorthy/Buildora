
from sqlalchemy import (
    Boolean,
    CHAR,
    Column,
    JSON,
    Numeric,
    String,
    false,
)
from sqlalchemy.dialects.mysql import INTEGER

from app.database import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    code = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)

    price = Column(Numeric(12, 2), nullable=True)
    currency = Column(CHAR(3), nullable=True)
    billing_interval = Column(String(20), nullable=True)

    project_limit = Column(
        INTEGER(unsigned=True),
        nullable=True,
    )

    features = Column(
        JSON,
        nullable=False,
        default=list,
    )

    is_published = Column(
        Boolean,
        nullable=False,
        server_default=false(),
    )
