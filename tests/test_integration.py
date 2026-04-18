import pytest
import subprocess
import tempfile
import os
from httpx import AsyncClient, ASGITransport
from backend.main import app


def _create_test_video(path: str, duration: float = 2.0):
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i",
         f"color=c=blue:s=320x240:d={duration}",
         "-c:v", "libx264", "-t", str(duration), path],
        capture_output=True, check=True,
    )


def _create_test_image(path: str):
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i",
         "color=c=green:s=320x240:d=1",
         "-frames:v", "1", path],
        capture_output=True, check=True,
    )


@pytest.mark.asyncio
async def test_full_edit_workflow():
    """Test: upload video + image -> create project -> add to timeline -> export."""
    transport = ASGITransport(app=app)

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, "test.mp4")
        image_path = os.path.join(tmpdir, "test.png")
        _create_test_video(video_path, duration=2.0)
        _create_test_image(image_path)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Upload video
            with open(video_path, "rb") as f:
                resp = await client.post(
                    "/api/media/upload",
                    files={"file": ("test.mp4", f, "video/mp4")},
                )
            assert resp.status_code == 200
            video_media = resp.json()
            assert video_media["media_type"] == "video"

            # Upload image
            with open(image_path, "rb") as f:
                resp = await client.post(
                    "/api/media/upload",
                    files={"file": ("test.png", f, "image/png")},
                )
            assert resp.status_code == 200
            image_media = resp.json()
            assert image_media["media_type"] == "image"

            # Create project
            resp = await client.post("/api/projects", json={"name": "Integration Test"})
            assert resp.status_code in (200, 201)
            project = resp.json()

            # Update timeline with clips
            timeline = {
                "mode": "storyboard",
                "clips": [
                    {
                        "id": "clip-1",
                        "media_id": video_media["id"],
                        "type": "video",
                        "trim_start": 0.0,
                        "trim_end": 2.0,
                        "crop": None,
                        "speed": 1.0,
                        "duration": None,
                        "order": 0,
                    },
                    {
                        "id": "clip-2",
                        "media_id": image_media["id"],
                        "type": "image",
                        "trim_start": 0.0,
                        "trim_end": None,
                        "crop": None,
                        "speed": 1.0,
                        "duration": 2.0,
                        "order": 1,
                    },
                ],
                "overlays": [],
            }

            resp = await client.put(
                f"/api/projects/{project['id']}",
                json={"timeline": timeline},
            )
            assert resp.status_code == 200
            assert len(resp.json()["timeline"]["clips"]) == 2

            # Start export
            resp = await client.post("/api/export", json={
                "project_id": str(project["id"]),
                "container": "mp4",
                "video_codec": "libx264",
                "audio_codec": "aac",
                "fps": 30,
                "quality_tier": "hd",
                "output_dir": tmpdir,
                "upload_to_drive": False,
            })
            assert resp.status_code == 200
            export_job = resp.json()
            assert export_job["status"] == "processing"
            assert "id" in export_job
