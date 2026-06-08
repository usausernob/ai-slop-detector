import io
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Request, UploadFile

from app.api.v1.token_verif import verify_extension_token
from app.api.v1.utils import (
    TaskResult,
    UrlRequest,
    donwload_and_run_inference,
    run_ai_inference,
)
from app.limiter import limiter
from app.redis_client import create_task

router = APIRouter()


@router.post("/")
@limiter.limit("5/minute")
async def analyze_audio(
    request: Request,
    file: UploadFile,
    background_task: BackgroundTasks,
    _=Depends(verify_extension_token),
) -> TaskResult:
    task_id = str(uuid.uuid4())
    create_task(task_id)
    file_buffer = io.BytesIO(await file.read())
    background_task.add_task(run_ai_inference, task_id, file_buffer)
    return TaskResult(task_id=task_id)


@router.post("/url")
@limiter.limit("5/minute")
def analyze_audio_url(
    request: Request,
    item: UrlRequest,
    background_task: BackgroundTasks,
    _=Depends(verify_extension_token),
) -> TaskResult:
    task_id = str(uuid.uuid4())
    create_task(task_id)

    background_task.add_task(donwload_and_run_inference, task_id, item.url)

    return TaskResult(task_id=task_id)
