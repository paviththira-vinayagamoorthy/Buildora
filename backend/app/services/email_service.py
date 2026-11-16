import logging
import smtplib
import ssl

from email.message import EmailMessage
from email.utils import formataddr

from app.config.settings import settings


logger = logging.getLogger(__name__)


class EmailNotConfiguredError(Exception):
    pass


class EmailDeliveryError(Exception):
    pass


def ensure_email_configured() -> None:
    required_values = (
        settings.SMTP_HOST,
        settings.SMTP_USERNAME,
        settings.SMTP_PASSWORD.get_secret_value(),
        settings.SMTP_FROM_EMAIL,
    )

    if not all(
        value and value.strip()
        for value in required_values
    ):
        raise EmailNotConfiguredError(
            "Email sending is not configured."
        )

    if not 1 <= settings.SMTP_PORT <= 65535:
        raise EmailNotConfiguredError(
            "Email server port is invalid."
        )

    if not 1 <= settings.SMTP_TIMEOUT_SECONDS <= 60:
        raise EmailNotConfiguredError(
            "Email server timeout is invalid."
        )


def send_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> None:
    ensure_email_configured()

    # These values become email headers.
    for value in (
        to_email,
        subject,
        settings.SMTP_FROM_EMAIL,
        settings.SMTP_FROM_NAME,
    ):
        if "\r" in value or "\n" in value:
            raise ValueError("Invalid email header.")

    if not to_email.strip() or not subject.strip():
        raise ValueError(
            "Recipient and subject are required."
        )

    message = EmailMessage()

    message["From"] = formataddr(
        (
            settings.SMTP_FROM_NAME,
            settings.SMTP_FROM_EMAIL,
        )
    )
    message["To"] = to_email
    message["Subject"] = subject

    message.set_content(text_body)

    if html_body is not None:
        message.add_alternative(
            html_body,
            subtype="html",
        )

    context = ssl.create_default_context()

    try:
        if settings.SMTP_SECURITY == "ssl":
            with smtplib.SMTP_SSL(
                host=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                timeout=settings.SMTP_TIMEOUT_SECONDS,
                context=context,
            ) as server:
                server.login(
                    settings.SMTP_USERNAME,
                    settings.SMTP_PASSWORD.get_secret_value(),
                )

                refused = server.send_message(message)

                if refused:
                    raise EmailDeliveryError(
                        "The email recipient was refused."
                    )

        else:
            with smtplib.SMTP(
                host=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                timeout=settings.SMTP_TIMEOUT_SECONDS,
            ) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()

                server.login(
                    settings.SMTP_USERNAME,
                    settings.SMTP_PASSWORD.get_secret_value(),
                )

                refused = server.send_message(message)

                if refused:
                    raise EmailDeliveryError(
                        "The email recipient was refused."
                    )

    except EmailDeliveryError:
        raise

    except (smtplib.SMTPException, OSError):
        # Do not log credentials, message bodies or token links.
        logger.error(
            "SMTP email delivery failed."
        )

        raise EmailDeliveryError(
            "Unable to send the email. Please try again later."
        ) from None