from fastapi import APIRouter, Response

from app.api.v1 import image_handler, audio_handler, video_handler
from app.types import StatusEnum, StatusTask
from app.redis_client import get_task

router = APIRouter()


@router.get("/ping")
def send_pong():
    return {"message": "pong"}


@router.get("/status/{task_id}")
def get_task_status(task_id: str, response: Response) -> StatusTask:
    data = get_task(task_id)
    if not data:
        response.status_code = 404
        return StatusTask(status=StatusEnum.NOT_FOUND)
    return data


router.include_router(image_handler.router, prefix="/image-analyze", tags=["image"])
router.include_router(audio_handler.router, prefix="/audio-analyze", tags=["audio"])
router.include_router(video_handler.router, prefix="/video-analyze", tags=["video"])
