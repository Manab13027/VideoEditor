import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger("clipforge")

from backend.config import settings
from backend.database import init_db
from backend.routers.export import router as export_router
from backend.routers.media import router as media_router
from backend.routers.projects import router as projects_router
from backend.routers.batch import router as batch_router
from backend.routers.websocket import router as websocket_router
from backend.routers.drive import router as drive_router
from backend.routers.ai import router as ai_router
from backend.routers.social import router as social_router
from backend.routers.audio import router as audio_router
from backend.workers.task_runner import shutdown_executor


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    await init_db()
    yield
    shutdown_executor()


app = FastAPI(title=settings.app_name, lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    logger.error("422 on %s %s — errors: %s", request.method, request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


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
app.include_router(ai_router)
app.include_router(social_router)
app.include_router(audio_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}
