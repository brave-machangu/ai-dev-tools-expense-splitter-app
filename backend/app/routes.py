"""HTTP routes — one per operation in _docs/openapi.yaml.

Handlers stay thin: parse the request (FastAPI + schemas), call the service,
return its result. Operation ids match the frontend's `api` client methods.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request, status

from app.schemas import (
    GROUP_CODE_PATTERN,
    CreateGroupInput,
    CreateGroupResult,
    ErrorResponse,
    ExpenseInput,
    GroupSnapshot,
    MemberNameInput,
    SettlementInput,
)
from app.service import GroupService


def get_service(request: Request) -> GroupService:
    return request.app.state.service


Service = Annotated[GroupService, Depends(get_service)]
GroupCode = Annotated[
    str,
    Path(pattern=GROUP_CODE_PATTERN, description="The group's 8-character code."),
]
MemberId = Annotated[UUID, Path()]
ExpenseId = Annotated[UUID, Path()]
SettlementId = Annotated[UUID, Path()]

NOT_FOUND = {404: {"model": ErrorResponse, "description": "Unknown group or record."}}
CONFLICT = {409: {"model": ErrorResponse, "description": "The member is still referenced."}}

router = APIRouter(prefix="/api/groups")


# --- groups --------------------------------------------------------------------


@router.post(
    "",
    tags=["Groups"],
    operation_id="createGroup",
    summary="Create a group",
    status_code=status.HTTP_201_CREATED,
)
def create_group(data: CreateGroupInput, service: Service) -> CreateGroupResult:
    return CreateGroupResult(code=service.create_group(data))


@router.get(
    "/{code}",
    tags=["Groups"],
    operation_id="getGroup",
    summary="Get the full group snapshot",
    responses=NOT_FOUND,
)
def get_group(code: GroupCode, service: Service) -> GroupSnapshot:
    return service.get_snapshot(code)


# --- members -------------------------------------------------------------------


@router.post(
    "/{code}/members",
    tags=["Members"],
    operation_id="addMember",
    summary="Add a member",
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND,
)
def add_member(code: GroupCode, data: MemberNameInput, service: Service) -> GroupSnapshot:
    return service.add_member(code, data)


@router.patch(
    "/{code}/members/{member_id}",
    tags=["Members"],
    operation_id="renameMember",
    summary="Rename a member",
    responses=NOT_FOUND,
)
def rename_member(
    code: GroupCode, member_id: MemberId, data: MemberNameInput, service: Service
) -> GroupSnapshot:
    return service.rename_member(code, member_id, data)


@router.delete(
    "/{code}/members/{member_id}",
    tags=["Members"],
    operation_id="deleteMember",
    summary="Delete a member",
    responses={**NOT_FOUND, **CONFLICT},
)
def delete_member(code: GroupCode, member_id: MemberId, service: Service) -> GroupSnapshot:
    return service.delete_member(code, member_id)


# --- expenses ------------------------------------------------------------------


@router.post(
    "/{code}/expenses",
    tags=["Expenses"],
    operation_id="createExpense",
    summary="Create an expense",
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND,
)
def create_expense(code: GroupCode, data: ExpenseInput, service: Service) -> GroupSnapshot:
    return service.create_expense(code, data)


@router.put(
    "/{code}/expenses/{expense_id}",
    tags=["Expenses"],
    operation_id="updateExpense",
    summary="Replace an expense",
    responses=NOT_FOUND,
)
def update_expense(
    code: GroupCode, expense_id: ExpenseId, data: ExpenseInput, service: Service
) -> GroupSnapshot:
    return service.update_expense(code, expense_id, data)


@router.delete(
    "/{code}/expenses/{expense_id}",
    tags=["Expenses"],
    operation_id="deleteExpense",
    summary="Delete an expense",
    responses=NOT_FOUND,
)
def delete_expense(code: GroupCode, expense_id: ExpenseId, service: Service) -> GroupSnapshot:
    return service.delete_expense(code, expense_id)


# --- settlements ---------------------------------------------------------------


@router.post(
    "/{code}/settlements",
    tags=["Settlements"],
    operation_id="createSettlement",
    summary="Record a payment",
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND,
)
def create_settlement(code: GroupCode, data: SettlementInput, service: Service) -> GroupSnapshot:
    return service.create_settlement(code, data)


@router.put(
    "/{code}/settlements/{settlement_id}",
    tags=["Settlements"],
    operation_id="updateSettlement",
    summary="Replace a payment",
    responses=NOT_FOUND,
)
def update_settlement(
    code: GroupCode, settlement_id: SettlementId, data: SettlementInput, service: Service
) -> GroupSnapshot:
    return service.update_settlement(code, settlement_id, data)


@router.delete(
    "/{code}/settlements/{settlement_id}",
    tags=["Settlements"],
    operation_id="deleteSettlement",
    summary="Delete a payment",
    responses=NOT_FOUND,
)
def delete_settlement(
    code: GroupCode, settlement_id: SettlementId, service: Service
) -> GroupSnapshot:
    return service.delete_settlement(code, settlement_id)
