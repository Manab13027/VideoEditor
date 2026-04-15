from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.database import init_db
from backend.routers.export import router as export_router
from backend.routers.media import router as media_router
from backend.routers.projects import router as projects_router
from backend.routers.batch import router as batch_router
from backend.routers.websocket import router as websocket_router
from backend.routers.drive import router as drive_router
from backend.workers.task_runner import shutdown_executor


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    await init_db()
    yield
    shutdown_executor()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(media_router)
app.include_router(projects_router)
app.include_router(batch_router)
app.include_router(export_router)
app.include_router(websocket_router)
app.include_router(drive_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}
