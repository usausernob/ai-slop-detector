import asyncio
import io
import logging
import uuid

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Request, UploadFile
from pydantic import BaseModel

from app.api.v1.token_verif import verify_extension_token
from app.limiter import limiter
from app.redis_client import create_task, update_task
from app.types import CheckResult, StatusEnum, StatusTask

router = APIRouter()

logger = logging.getLogger(__name__)


async def download_file(url: str) -> io.BytesIO:
    async with httpx.AsyncClient() as client:
        logger.info(f"Starting download file from {url}")
        response = await client.get(url)
        response.raise_for_status()
        return io.BytesIO(response.content)


async def run_ai_inference(task_id: str, file: io.IOBase):
    try:
        update_task(task_id, StatusTask(status=StatusEnum.PROCESSING))

        await asyncio.sleep(10)  # dummy
        result = CheckResult(is_ai=True, confidence=0.98)

        update_task(task_id, StatusTask(status=StatusEnum.COMPLETED, result=result))

    except Exception as e:
        logger.error(f"[{task_id}] Inference failed: {e}")
        update_task(task_id, StatusTask(status=StatusEnum.ERROR, error=str(e)))


async def run_ai_inference_download(task_id: str, image_url: str):
    try:
        file_buffer = await download_file(image_url)
        await run_ai_inference(task_id, file_buffer)
    except Exception as e:
        logger.error(f"[{task_id}] Failed to process {image_url}: {e}")
        update_task(task_id, StatusTask(status=StatusEnum.ERROR, error=str(e)))


class UrlRequest(BaseModel):
    url: str


class TaskResult(BaseModel):
    task_id: str


@router.post("/")
@limiter.limit("5/minute")
async def analyze_image(
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
def analyze_image_url(
    request: Request,
    item: UrlRequest,
    background_task: BackgroundTasks,
    _=Depends(verify_extension_token),
) -> TaskResult:
    task_id = str(uuid.uuid4())
    create_task(task_id)

    background_task.add_task(run_ai_inference_download, task_id, item.url)

    return TaskResult(task_id=task_id)
