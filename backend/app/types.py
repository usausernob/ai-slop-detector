from enum import Enum

from pydantic import BaseModel


class StatusEnum(str, Enum):
    NOT_FOUND = "not found"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ERROR = "error"


class CheckResult(BaseModel):
    is_ai: bool
    confidence: float


class StatusTask(BaseModel):
    status: StatusEnum
    result: CheckResult | None = None
    error: str | None = None
