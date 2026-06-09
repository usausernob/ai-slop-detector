from typing import Awaitable, Callable

import httpx
import logging
import io


from pydantic import BaseModel

from app.redis_client import update_task
from app.types import CheckResult, StatusEnum, StatusTask
from app.env import env

logger = logging.getLogger(__name__)


class UrlRequest(BaseModel):
    url: str


class TaskResult(BaseModel):
    task_id: str


class AIResponse(BaseModel):
    status: str
    filename: str
    type: str | None = None
    prediction: str
    confidence: str
    details: dict | None = None


async def download_file(url: str) -> tuple[io.BytesIO, str]:
    async with httpx.AsyncClient() as client:
        logger.info(f"Starting download file from {url}")
        response = await client.get(url)
        response.raise_for_status()
        content_type = response.headers.get("Content-Type")
        return io.BytesIO(response.content), content_type


async def run_image_inference(task_id: str, file: io.IOBase, content_type: str):
    await run_ai_inference(task_id, file, f"{env.API_IMAGE_URL}/predict", content_type)


async def run_audio_inference(task_id: str, file: io.IOBase, content_type: str):
    await run_ai_inference(task_id, file, f"{env.API_AUDIO_URL}/predict_audio", content_type)


async def run_video_inference(task_id: str, file: io.IOBase, content_type: str):
    await run_ai_inference(task_id, file, env.API_VIDEO_URL, content_type)

async def run_ai_inference(task_id: str, file: io.IOBase, url: str, content_type: str):
    try:
        update_task(task_id, StatusTask(status=StatusEnum.PROCESSING))

        file.seek(0)

        file_bytes = file.read()
        data = None
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=5.0)) as client:
            files = {"file": ("data-upload", file_bytes, content_type)}
            response = await client.post(url=f"{url}", files=files)
            response.raise_for_status()
            data = AIResponse(**response.json())

        if data.status != "success":
            raise Exception("Api Request Success but AI failed to detect")

        result = CheckResult(
            is_ai=(data.prediction == "FAKE"),
            confidence=float(data.confidence[:-1]) / 100,  # hacky
        )

        update_task(task_id, StatusTask(status=StatusEnum.COMPLETED, result=result))

    except Exception as e:
        logger.error(f"[{task_id}] Inference failed: {e}")
        update_task(task_id, StatusTask(status=StatusEnum.ERROR, error=str(e)))


async def donwload_and_run_inference(
    task_id: str, media_url: str, func: Callable[[str, io.IOBase, str], Awaitable[None]]
):
    try:
        file_buffer, content_type = await download_file(media_url)
        await func(task_id, file_buffer, content_type)
    except Exception as e:
        logger.error(f"[{task_id}] Failed to process {media_url}: {e}")
        update_task(task_id, StatusTask(status=StatusEnum.ERROR, error=str(e)))
