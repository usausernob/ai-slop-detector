from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1 import api
from app.limiter import limiter

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^chrome-extension://.*|^moz-extension://.*",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore

app.include_router(api.router, prefix="/api/v1")
