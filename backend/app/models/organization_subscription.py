
from sqlalchemy import Column, ForeignKey, Integer, String, DateTime
from app.database import Base


class OrganizationSubscription(Base):
    __tablename__ = "organization_subscriptions"

    organization_id = Column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        primary_key=True,
    )

    plan_code = Column(String(50), nullable=False)
    status = Column(String(30), nullable=False)

    trial_started_at = Column(DateTime, nullable=True)
    trial_ends_at = Column(DateTime, nullable=True)

    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)

    stripe_customer_id = Column(String(255), nullable=True)
    stripe_subscription_id = Column(String(255), nullable=True)
    stripe_checkout_session_id = Column(String(255), nullable=True)
