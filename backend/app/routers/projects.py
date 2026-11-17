from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError

from app.models.boq import BOQ
from app.models.invitation import Invitation

from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.project import Project
from app.models.project_member import ProjectMember

from app.schemas.project import (
    ProjectCreate,
    ProjectResponse,
    ProjectMemberAdd,
    ProjectMemberResponse,
)

from app.services.project_cover import prepare_project_cover

from app.models.organization_subscription import OrganizationSubscription
from app.routers.billing import get_project_limit


router = APIRouter(
    prefix="/projects",
    tags=["Projects"],
)


ALLOWED_PROJECT_ROLES = {
    "qs",
    "building_owner",
}


# =========================================================
# HELPERS
# =========================================================

def get_organization_membership(
    db: Session,
    organization_id: int,
    user_id: int,
):
    return (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id
            == organization_id,
            OrganizationMember.user_id == user_id,
        )
        .first()
    )


def get_project_membership(
    db: Session,
    project_id: int,
    user_id: int,
):
    return (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        .first()
    )


def get_project_or_404(
    db: Session,
    project_id: int,
):
    project = (
        db.query(Project)
        .filter(Project.id == project_id)
        .first()
    )

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    return project


def user_can_access_project(
    db: Session,
    project: Project,
    user_id: int,
):
    organization_membership = (
        get_organization_membership(
            db,
            project.organization_id,
            user_id,
        )
    )

    # Organization Admin can access all projects
    if (
        organization_membership
        and organization_membership.member_role
        == "organization_admin"
    ):
        return True

    project_membership = get_project_membership(
        db,
        project.id,
        user_id,
    )

    return project_membership is not None


# =========================================================
# CREATE PROJECT
# Approved company + Organization Admin only
# =========================================================

@router.post(
    "/organizations/{organization_id}",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    organization_id: int,
    project_data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        print("BUILDORA CREATE PROJECT ENDPOINT HIT", flush=True)

        # Lock company while checking approval and creating project.
        organization = (
            db.query(Organization)
            .filter(
                Organization.id == organization_id
            )
            .with_for_update()
            .populate_existing()
            .first()
        )

        if organization is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found.",
            )

        membership = get_organization_membership(
            db,
            organization_id,
            current_user.id,
        )

        if (
            membership is None
            or membership.member_role != "organization_admin"
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Only an Organization Admin "
                    "can create projects."
                ),
            )

        if organization.verification_status != "approved":
            messages = {
                "unsubmitted": (
                    "Submit your company details for verification "
                    "before creating a project."
                ),
                "pending": (
                    "Your company verification is under review. "
                    "Projects can be created after approval."
                ),
                "rejected": (
                    "Your company verification was rejected. "
                    "Review the reason, correct your details "
                    "and resubmit before creating a project."
                ),
            }

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=messages.get(
                    organization.verification_status,
                    "Company approval is required to create projects.",
                ),
            )

        # Enforce subscription project limit
        sub = db.get(
            OrganizationSubscription,
            organization_id,
        )

        project_limit = get_project_limit(sub)

        active_count = (
            db.query(Project)
            .filter(
                Project.organization_id == organization_id,
                Project.status == "active",
            )
            .count()
        )

        if project_limit == 0:
            raise HTTPException(
                status_code=403,
                detail="An active subscription is required to create projects.",
            )

        if project_limit is not None and active_count >= project_limit:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Your subscription allows only {project_limit} "
                    "active projects. Archive an existing project "
                    "or upgrade your plan."
                ),
            )

        name = project_data.name.strip()

        if len(name) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Enter a project name with at least 2 characters.",
            )

        project = Project(
            organization_id=organization_id,
            name=name,
            location=(
                project_data.location.strip() or None
                if project_data.location
                else None
            ),
            description=(
                project_data.description.strip() or None
                if project_data.description
                else None
            ),
                        cover_image=prepare_project_cover(project_data.cover_image),
            status="active",
            created_by=current_user.id,
        )

        db.add(project)
        db.flush()

        result = ProjectResponse.model_validate(
            project,
            from_attributes=True,
        )

        db.commit()

        return result

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create project.",
        )

# =========================================================
# GET MY PROJECTS
# =========================================================

@router.get(
    "/mine",
    response_model=list[ProjectResponse],
)
def get_my_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Projects where user is explicitly a project member
    member_projects = (
        db.query(Project)
        .join(
            ProjectMember,
            ProjectMember.project_id == Project.id,
        )
        .filter(
            ProjectMember.user_id == current_user.id
        )
        .all()
    )

    # Organizations where user is admin
    admin_memberships = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.user_id
            == current_user.id,
            OrganizationMember.member_role
            == "organization_admin",
        )
        .all()
    )

    admin_organization_ids = [
        membership.organization_id
        for membership in admin_memberships
    ]

    admin_projects = []

    if admin_organization_ids:
        admin_projects = (
            db.query(Project)
            .filter(
                Project.organization_id.in_(
                    admin_organization_ids
                )
            )
            .all()
        )

    # Remove duplicates
    project_map = {}

    for project in member_projects + admin_projects:
        project_map[project.id] = project

    projects = list(project_map.values())

    projects.sort(
        key=lambda project: project.created_at,
        reverse=True,
    )

    return projects


# =========================================================
# GET ORGANIZATION PROJECTS
# =========================================================

@router.get(
    "/organizations/{organization_id}",
    response_model=list[ProjectResponse],
)
def get_organization_projects(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = get_organization_membership(
        db,
        organization_id,
        current_user.id,
    )

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have access "
                "to this organization."
            ),
        )

    # Organization Admin can see all
    if membership.member_role == "organization_admin":
        return (
            db.query(Project)
            .filter(
                Project.organization_id
                == organization_id
            )
            .order_by(
                Project.created_at.desc()
            )
            .all()
        )

    # Other organization members only see
    # projects explicitly assigned to them
    return (
        db.query(Project)
        .join(
            ProjectMember,
            ProjectMember.project_id == Project.id,
        )
        .filter(
            Project.organization_id
            == organization_id,
            ProjectMember.user_id
            == current_user.id,
        )
        .order_by(
            Project.created_at.desc()
        )
        .all()
    )


# =========================================================
# GET ONE PROJECT
# =========================================================

@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_or_404(
        db,
        project_id,
    )

    if not user_can_access_project(
        db,
        project,
        current_user.id,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have access "
                "to this project."
            ),
        )

    return project


# =========================================================
# ADD PROJECT MEMBER
# Organization Admin only
# =========================================================

# =========================================================
# DIRECT MEMBER ADDITION DISABLED
# New members must accept an invitation.
# =========================================================

@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
    deprecated=True,
)
def add_project_member(
    project_id: int,
    member_data: ProjectMemberAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_or_404(
        db,
        project_id,
    )

    membership = get_organization_membership(
        db,
        project.organization_id,
        current_user.id,
    )

    if (
        membership is None
        or membership.member_role != "organization_admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization Admin access required.",
        )

    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=(
            "Direct member assignment is disabled. "
            "Send a project invitation instead. "
            "The member will receive access after accepting it."
        ),
    )

# =========================================================
# GET PROJECT MEMBERS
# =========================================================

@router.get(
    "/{project_id}/members",
    response_model=list[ProjectMemberResponse],
)
def get_project_members(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_or_404(
        db,
        project_id,
    )

    if not user_can_access_project(
        db,
        project,
        current_user.id,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have access "
                "to this project."
            ),
        )

    rows = (
        db.query(
            ProjectMember,
            User,
        )
        .join(
            User,
            User.id == ProjectMember.user_id,
        )
        .filter(
            ProjectMember.project_id
            == project_id
        )
        .order_by(
            ProjectMember.joined_at.asc()
        )
        .all()
    )

    return [
        {
            "id": member.id,
            "user_id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "project_role": member.project_role,
            "joined_at": member.joined_at,
        }
        for member, user in rows
    ]

    # =========================================================
# PROJECT MANAGEMENT
# =========================================================

class ProjectDeleteConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirmation_name: str = Field(
        min_length=1,
        max_length=150,
    )


def get_project_for_management(
    db: Session,
    project_id: int,
    current_user: User,
):
    project = (
        db.query(Project)
        .filter(Project.id == project_id)
        .with_for_update()
        .populate_existing()
        .first()
    )

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found.",
        )

    membership = get_organization_membership(
        db,
        project.organization_id,
        current_user.id,
    )

    if (
        membership is None
        or membership.member_role != "organization_admin"
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "Only an Organization Admin can "
                "delete or archive this project."
            ),
        )

    return project


# =========================================================
# EDIT PROJECT
# Organization Admin only
# =========================================================

@router.patch(
    "/{project_id}",
    response_model=ProjectResponse,
)
def edit_project(
    project_id: int,
    project_data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        project = get_project_for_management(
            db,
            project_id,
            current_user,
        )

        if project.status == "archived":
            raise HTTPException(
                status_code=400,
                detail="Archived projects cannot be edited.",
            )

        project.name = project_data.name.strip()
        project.location = project_data.location.strip()
        project.description = project_data.description.strip()

        db.commit()
        db.refresh(project)

        return project

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to update the project.",
        )

class ProjectCoverUpdate(BaseModel):
    cover_image: str = Field(max_length=7_000_000)


@router.patch("/{project_id}/cover")
def update_project_cover(
    project_id: int,
    payload: ProjectCoverUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        project = get_project_for_management(db, project_id, current_user)
        cover_image = prepare_project_cover(payload.cover_image)
        project.cover_image = cover_image
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {"cover_image": cover_image}

# =========================================================
# DELETE EMPTY PROJECT
# =========================================================

@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_project(
    project_id: int,
    payload: ProjectDeleteConfirmation,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        project = get_project_for_management(
            db,
            project_id,
            current_user,
        )

        if payload.confirmation_name != project.name:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Type the project name exactly "
                    "to confirm deletion."
                ),
            )

        has_boq = (
            db.query(BOQ.id)
            .filter(BOQ.project_id == project.id)
            .first()
            is not None
        )

        has_members = (
            db.query(ProjectMember.id)
            .filter(ProjectMember.project_id == project.id)
            .first()
            is not None
        )

        # Includes pending, accepted and declined invitations.
        has_invitations = (
            db.query(Invitation.id)
            .filter(Invitation.project_id == project.id)
            .first()
            is not None
        )

        linked_records = []

        if has_boq:
            linked_records.append("BOQs")

        if has_members:
            linked_records.append("assigned members")

        if has_invitations:
            linked_records.append("invitation history")

        if linked_records:
            raise HTTPException(
                status_code=409,
                detail=(
                    "This project has "
                    + ", ".join(linked_records)
                    + ". Archive it instead of deleting it."
                ),
            )

        db.delete(project)
        db.commit()

        return None

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail=(
                "This project has linked records "
                "and cannot be deleted. Archive it instead."
            ),
        )

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to delete the project.",
        )


# =========================================================
# ARCHIVE PROJECT — KEEP ITS RECORDS
# =========================================================

@router.post(
    "/{project_id}/archive",
    response_model=ProjectResponse,
)
def archive_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        project = get_project_for_management(
            db,
            project_id,
            current_user,
        )

        if project.status != "archived":
            project.status = "archived"

        db.commit()
        db.refresh(project)

        return project

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to archive the project.",
        )


# =========================================================
# RESTORE ARCHIVED PROJECT
# Organization Admin only
# =========================================================

@router.post(
    "/{project_id}/restore",
    response_model=ProjectResponse,
)
def restore_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        project = get_project_for_management(
            db,
            project_id,
            current_user,
        )

        if project.status != "archived":
            raise HTTPException(
                status_code=400,
                detail="Only archived projects can be restored.",
            )

        # Check subscription limit before restoring a project
        sub = db.get(
            OrganizationSubscription,
            project.organization_id,
        )

        project_limit = get_project_limit(sub)

        active_count = (
            db.query(Project)
            .filter(
                Project.organization_id == project.organization_id,
                Project.status == "active",
            )
            .count()
        )

        if project_limit == 0:
            raise HTTPException(
                status_code=403,
                detail="An active subscription is required to restore projects.",
            )

        if project_limit is not None and active_count >= project_limit:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Your subscription allows only {project_limit} "
                    "active projects. Archive an existing project "
                    "or upgrade your plan."
                ),
            )

        project.status = "active"

        db.commit()
        db.refresh(project)

        return project

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to restore the project.",
        )
