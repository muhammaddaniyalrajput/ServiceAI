from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    PROJECT_NAME: str = "ServiceFlow AI"
    APP_ENV: str = "development"
    LOG_LEVEL: str = "DEBUG"

    GEMINI_API_KEY: str = ""
    GOOGLE_MAPS_API_KEY: str = ""
    USE_MOCK_MAPS: bool = True

    FIREBASE_CREDENTIALS_JSON_PATH: str = "./firebase-admin.json"

    CORS_ORIGINS: str = "http://localhost:8081,http://localhost:3000"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
