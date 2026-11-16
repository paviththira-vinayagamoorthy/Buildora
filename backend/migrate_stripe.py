
from sqlalchemy import inspect, text
from app.database import engine

COLUMNS = {
    "trial_started_at": "DATETIME NULL",
    "trial_ends_at": "DATETIME NULL",
    "current_period_start": "DATETIME NULL",
    "current_period_end": "DATETIME NULL",
    "stripe_customer_id": "VARCHAR(255) NULL",
    "stripe_subscription_id": "VARCHAR(255) NULL",
    "stripe_checkout_session_id": "VARCHAR(255) NULL",
}


def migrate():
    inspector = inspect(engine)

    table = "organization_subscriptions"

    if not inspector.has_table(table):
        raise RuntimeError(
            "organization_subscriptions table not found."
        )

    existing = {
        col["name"]
        for col in inspector.get_columns(table)
    }

    with engine.begin() as connection:
        for name, definition in COLUMNS.items():
            if name not in existing:
                connection.execute(
                    text(
                        f"ALTER TABLE {table} "
                        f"ADD COLUMN {name} {definition}"
                    )
                )
                print(f"ADDED: {name}")
            else:
                print(f"EXISTS: {name}")

        connection.execute(
            text("""
                CREATE TABLE IF NOT EXISTS
                stripe_webhook_events (
                    event_id VARCHAR(255) PRIMARY KEY,
                    processed_at DATETIME NOT NULL
                )
            """)
        )

        print("Stripe webhook events table ready.")

    print("Migration completed successfully.")


if __name__ == "__main__":
    migrate()
