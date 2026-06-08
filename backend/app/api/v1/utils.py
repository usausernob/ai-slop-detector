import asyncio

import httpx
import logging
import io

import random

from pydantic import BaseModel

from app.redis_client import update_task
from app.types import CheckResult, StatusEnum, StatusTask

logger = logging.getLogger(__name__)


class UrlRequest(BaseModel):
    url: str


class TaskResult(BaseModel):
    task_id: str


async def download_file(url: str) -> io.BytesIO:
    async with httpx.AsyncClient() as client:
        logger.info(f"Starting download file from {url}")
        response = await client.get(url)
        response.raise_for_status()
        return io.BytesIO(response.content)


# TODO: of course we must split to 3 different function
async def run_ai_inference(task_id: str, file: io.IOBase):
    try:
        update_task(task_id, StatusTask(status=StatusEnum.PROCESSING))

        await asyncio.sleep(10)  # dummy processing
        # TODO
        result = CheckResult(
            is_ai=(random.randint(0, 1) == 1), confidence=random.uniform(0, 1)
        )

        update_task(task_id, StatusTask(status=StatusEnum.COMPLETED, result=result))

    except Exception as e:
        logger.error(f"[{task_id}] Inference failed: {e}")
        update_task(task_id, StatusTask(status=StatusEnum.ERROR, error=str(e)))


async def donwload_and_run_inference(task_id: str, image_url: str):
    try:
        file_buffer = await download_file(image_url)
        await run_ai_inference(task_id, file_buffer)
    except Exception as e:
        logger.error(f"[{task_id}] Failed to process {image_url}: {e}")
        update_task(task_id, StatusTask(status=StatusEnum.ERROR, error=str(e)))
