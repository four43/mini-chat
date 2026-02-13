from pydantic import BaseModel

class UserPreferences(BaseModel):
    color: str

class GetPreferencesResponse(BaseModel):
    username: str
    color: str

class UpdatePreferencesRequest(BaseModel):
    color: str

class UpdatePreferencesResponse(BaseModel):
    status: str
