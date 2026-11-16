from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user

from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.invitation import Invitation


router = APIRouter(
    prefix="/workspace",
    tags=["Workspace"],
)


@router.get("/context")
def get_workspace_context(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # -----------------------------------------------------
    # 1. ORGANIZATION MEMBERSHIPS
    # -----------------------------------------------------
    organization_rows = (
        db.query(
            OrganizationMember,
            Organization,
        )
        .join(
            Organization,
            Organization.id == OrganizationMember.organization_id,
        )
        .filter(
            OrganizationMember.user_id == current_user.id,
        )
        .all()
    )

    organizations = [
        {
            "id": organization.id,
            "name": organization.name,
            "member_role": membership.member_role,
        }
        for membership, organization in organization_rows
    ]

    # -----------------------------------------------------
    # 2. PROJECT MEMBERSHIPS
    # -----------------------------------------------------
    project_rows = (
        db.query(
            ProjectMember,
            Project,
        )
        .join(
            Project,
            Project.id == ProjectMember.project_id,
        )
        .filter(
            ProjectMember.user_id == current_user.id,
        )
        .all()
    )

    projects = [
        {
            "id": project.id,
            "organization_id": project.organization_id,
            "name": project.name,
            "location": project.location,
            "cover_image": project.cover_image,
            "status": project.status,
            "project_role": membership.project_role,
        }
        for membership, project in project_rows
    ]

    # -----------------------------------------------------
    # 3. ADMIN PROJECTS
    # Organization admins can also see projects without
    # an explicit ProjectMember record.
    # -----------------------------------------------------
    admin_organization_ids = [
        organization["id"]
        for organization in organizations
        if organization["member_role"] == "organization_admin"
    ]

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

        existing_project_ids = {
            project["id"]
            for project in projects
        }

        for project in admin_projects:
            if project.id not in existing_project_ids:
                projects.append(
                    {
                        "id": project.id,
                        "organization_id": project.organization_id,
                        "name": project.name,
                        "location": project.location,
                        "cover_image": project.cover_image,
                        "status": project.status,
                        "project_role": "organization_admin",
                    }
                )

                existing_project_ids.add(project.id)

    # -----------------------------------------------------
    # 4. PENDING INVITATIONS
    # -----------------------------------------------------
    pending_rows = (
        db.query(
            Invitation,
            Organization,
        )
        .join(
            Organization,
            Organization.id == Invitation.organization_id,
        )
        .filter(
            Invitation.email == current_user.email.lower(),
            Invitation.status == "pending",
        )
        .order_by(
            Invitation.created_at.desc()
        )
        .all()
    )

    pending_invitations = [
        {
            "id": invitation.id,
            "organization_id": organization.id,
            "organization_name": organization.name,
            "member_role": invitation.member_role,
            "project_id": invitation.project_id,
            "project_name": (
                invitation.project.name
                if invitation.project
                else None
            ),
            "project_role": invitation.project_role,
            "status": invitation.status,
            "created_at": invitation.created_at,
        }
        for invitation, organization in pending_rows
    ]

    # -----------------------------------------------------
    # 5. DETERMINE ENTRY TYPE
    # -----------------------------------------------------
    is_organization_admin = any(
        organization["member_role"] == "organization_admin"
        for organization in organizations
    )

    is_qs = any(
        project["project_role"] == "qs"
        for project in projects
    )

    is_building_owner = any(
        project["project_role"] == "building_owner"
        for project in projects
    )

    # Priority:
    # platform admin
    # organization admin
    # QS
    # building owner
    # pending invitation
    # new user

    if getattr(current_user, "system_role", "user") == "platform_admin":
        entry_type = "platform_admin"

    elif is_organization_admin:
        entry_type = "organization_admin"

    elif is_qs:
        entry_type = "qs"

    elif is_building_owner:
        entry_type = "building_owner"

    elif pending_invitations:
        entry_type = "pending_invitation"

    else:
        entry_type = "new_user"

    # -----------------------------------------------------
    # 6. FRONTEND ACTION
    # -----------------------------------------------------
    next_action_map = {
        "platform_admin": "open_admin_dashboard",
        "organization_admin": "open_organization_workspace",
        "qs": "open_qs_workspace",
        "building_owner": "open_owner_workspace",
        "pending_invitation": "review_invitations",
        "new_user": "start_workspace_setup",
    }

    # -----------------------------------------------------
    # RESPONSE
    # -----------------------------------------------------
    return {
        "user": {
            "id": current_user.id,
            "full_name": current_user.full_name,
            "email": current_user.email,
            "system_role": getattr(
                current_user,
                "system_role",
                "user",
            ),
        },
        "entry_type": entry_type,
        "next_action": next_action_map[entry_type],
        "organizations": organizations,
        "projects": projects,
        "pending_invitations": pending_invitations,
    }