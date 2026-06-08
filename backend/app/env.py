from pydantic_settings import BaseSettings, SettingsConfigDict


class Env(BaseSettings):
    API_URL: str = "http://127.0.0.1:8000"
    APP_TOKEN: str = ""

    model_config = SettingsConfigDict(env_file=".env")


env = Env()
