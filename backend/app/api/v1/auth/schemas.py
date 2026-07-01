"""
Auth domain — schemas.

Pydantic v2 models for the auth miniservice.
"""
from pydantic import BaseModel


class WhoAmIResponse(BaseModel):
    uid:  str
    mock: bool = False
