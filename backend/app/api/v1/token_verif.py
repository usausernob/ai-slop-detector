from fastapi import Header, HTTPException
from app.env import env


def verify_extension_token(x_app_token: str = Header(...)):
    # TODO: find a good token
    if x_app_token != env.APP_TOKEN:
        raise HTTPException(status_code=403, detail="Akses ditolak")
