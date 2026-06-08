from fastapi import Header, HTTPException


def verify_extension_token(x_app_token: str = Header(...)):
    # TODO: find a good token
    if x_app_token != "123":
        raise HTTPException(status_code=403, detail="Akses ditolak")
