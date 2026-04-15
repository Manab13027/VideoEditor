from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services import drive_service

router = APIRouter(prefix="/api/drive", tags=["drive"])


class UploadRequest(BaseModel):
    file_path: str
    folder_id: str | None = None
    filename: str | None = None


@router.get("/status")
async def drive_status():
    configured = drive_service.is_drive_configured()
    authenticated = False
    if configured:
        authenticated = drive_service._get_credentials() is not None
    return {"configured": configured, "authenticated": authenticated}


@router.post("/auth")
async def start_auth():
    if not drive_service.is_drive_configured():
        raise HTTPException(status_code=400, detail="credentials.json not found")
    auth_url = drive_service.get_auth_url()
    return {"auth_url": auth_url}


@router.get("/callback")
async def auth_callback(code: str):
    try:
        drive_service.complete_auth(code)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "authenticated"}


@router.post("/upload")
async def upload_file(req: UploadRequest):
    if not drive_service.is_drive_configured():
        raise HTTPException(status_code=400, detail="Drive not configured")
    creds = drive_service._get_credentials()
    if creds is None:
        raise HTTPException(status_code=401, detail="Not authenticated with Google Drive")
    try:
        file_id = drive_service.upload_to_drive(
            req.file_path,
            folder_id=req.folder_id,
            filename=req.filename,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"file_id": file_id}
