from fastapi import FastAPI, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import Base, engine
from app.models.user import User
from app.routers.auth import router as auth_router
from app.routers import organizations
from app.routers import projects
from app.routers import billing

from app.database import get_db
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from fastapi.middleware.cors import CORSMiddleware
from app.routers import invitations
from app.models.invitation import Invitation
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.routers import workspace
from app.routers import boq
from app.routers import profile
from app.models.valuation import Valuation, ValuationItem
from app.routers import valuations
from app.routers import certificates
from app.routers import payments
from app.routers import documents
from app.routers import site_updates
from app.routers import monthly_reports
from app.routers import variations
from app.routers import report_comments
from app.routers import owner_overview
from app.models.organization_verification_document import (
    OrganizationVerificationDocument,
)
from app.models.organization_verification_review import (
    OrganizationVerificationReview,
)
from app.routers import organization_documents
from app.routers import platform_admin
from app.models.organization_email_verification import (
    OrganizationEmailVerification,
)
from app.routers import organization_email
from app.models.password_reset_token import PasswordResetToken
from app.routers import password_reset

from app.models.variation import Variation

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Buildora API",
    description="AI-Assisted Construction Cost and Project Transparency Platform",
    version="1.0.0"
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(organizations.router)
app.include_router(invitations.router)
app.include_router(projects.router)
app.include_router(workspace.router)
app.include_router(boq.router)
app.include_router(profile.router)
app.include_router(valuations.router)
app.include_router(certificates.router)
app.include_router(payments.router)
app.include_router(documents.router)
app.include_router(site_updates.router)
app.include_router(monthly_reports.router)
app.include_router(report_comments.router)
app.include_router(owner_overview.router)
app.include_router(organization_documents.router)
app.include_router(platform_admin.router)
app.include_router(organization_email.router)
app.include_router(password_reset.router)
app.include_router(variations.router)
app.include_router(billing.router)

@app.get("/")
def root():
    return {
        "message": "Buildora API is running"
    }


@app.get("/db-test")
def test_database(db: Session = Depends(get_db)):
    result = db.execute(text("SELECT DATABASE()"))
    database_name = result.scalar()

    return {
        "status": "success",
        "message": "Database connected successfully",
        "database": database_name
    }