import json
import os
from pathlib import Path

from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow

_SCOPES = ["https://www.googleapis.com/auth/drive.file"]

_BASE_DIR = Path(__file__).parent.parent
_CREDENTIALS_PATH = _BASE_DIR / "credentials.json"
_TOKEN_PATH = _BASE_DIR / "token.json"

_REDIRECT_URI = "http://localhost:8000/api/drive/callback"


def is_drive_configured() -> bool:
    return _CREDENTIALS_PATH.exists()


def get_auth_url() -> str:
    flow = Flow.from_client_secrets_file(
        str(_CREDENTIALS_PATH),
        scopes=_SCOPES,
        redirect_uri=_REDIRECT_URI,
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


def complete_auth(auth_code: str) -> None:
    flow = Flow.from_client_secrets_file(
        str(_CREDENTIALS_PATH),
        scopes=_SCOPES,
        redirect_uri=_REDIRECT_URI,
    )
    flow.fetch_token(code=auth_code)
    creds = flow.credentials
    _TOKEN_PATH.write_text(creds.to_json())


def _get_credentials() -> Credentials | None:
    if not _TOKEN_PATH.exists():
        return None
    creds = Credentials.from_authorized_user_file(str(_TOKEN_PATH), _SCOPES)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        _TOKEN_PATH.write_text(creds.to_json())
    if creds and creds.valid:
        return creds
    return None


def upload_to_drive(
    file_path: str,
    folder_id: str | None = None,
    filename: str | None = None,
) -> str:
    creds = _get_credentials()
    if creds is None:
        raise RuntimeError("Not authenticated with Google Drive")

    service = build("drive", "v3", credentials=creds)

    path = Path(file_path)
    name = filename or path.name

    metadata: dict = {"name": name}
    if folder_id:
        metadata["parents"] = [folder_id]

    media = MediaFileUpload(str(path), resumable=True)
    file = (
        service.files()
        .create(body=metadata, media_body=media, fields="id")
        .execute()
    )
    return file["id"]
