from pydantic_settings import BaseSettings, SettingsConfigDict


class Env(BaseSettings):
    API_IMAGE_URL: str = "http://127.0.0.1:8000"
    API_AUDIO_URL: str = "http://127.0.0.1:8000"
    API_VIDEO_URL: str = "http://127.0.0.1:8000"
    APP_TOKEN: str = ""

    model_config = SettingsConfigDict(env_file=".env")


env = Env()
