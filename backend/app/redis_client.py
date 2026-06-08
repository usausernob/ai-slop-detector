import redis
from app.types import StatusTask, StatusEnum

redis_client = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)


def create_task(task_id: str):
    status = StatusTask(status=StatusEnum.QUEUED, result=None)
    json_data = status.model_dump_json()
    redis_client.set(f"task:{task_id}", json_data, ex=3600)


def update_task(task_id: str, data: StatusTask):
    json_data = data.model_dump_json()
    redis_client.set(f"task:{task_id}", json_data, ex=3600)


def get_task(task_id: str) -> StatusTask | None:
    raw_data = redis_client.get(f"task:{task_id}")
    if raw_data:
        return StatusTask.model_validate_json(raw_data)
    return None
