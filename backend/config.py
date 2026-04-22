from pathlib import Path
from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "ClipForge"

    data_dir: Path = Path("data")
    upload_dir: Path = Path("data/uploads")
    proxy_dir: Path = Path("data/proxies")
    export_dir: Path = Path("data/exports")
    thumbnail_dir: Path = Path("data/thumbnails")
    audio_dir: Path = Path("data/audio")
    db_path: Path = Path("data/clipforge.db")

    max_workers: int = 3
    proxy_resolution: str = "1280x720"

    allowed_video_extensions: set[str] = {
        ".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv",
        ".wmv", ".mpeg", ".mpg", ".3gp", ".m4v", ".ts",
        ".vob", ".ogv", ".asf",
    }
    allowed_image_extensions: set[str] = {
        ".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif",
        ".gif", ".webp", ".svg", ".ico", ".tga",
    }
    allowed_audio_extensions: set[str] = {
        ".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a", ".wma", ".opus",
    }

    def ensure_dirs(self) -> None:
        for d in (
            self.data_dir,
            self.upload_dir,
            self.proxy_dir,
            self.export_dir,
            self.thumbnail_dir,
            self.audio_dir,
        ):
            d.mkdir(parents=True, exist_ok=True)


settings = Settings()
