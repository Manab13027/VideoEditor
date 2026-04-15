from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json

router = APIRouter()

_connections: dict[str, list[WebSocket]] = {}


async def broadcast_progress(job_id: str, data: dict) -> None:
    if job_id not in _connections:
        return
    dead: list[WebSocket] = []
    for ws in _connections[job_id]:
        try:
            await ws.send_text(json.dumps(data))
        except Exception:
            dead.append(ws)
    for ws in dead:
        _connections[job_id].remove(ws)
    if not _connections[job_id]:
        del _connections[job_id]


@router.websocket("/ws/progress/{job_id}")
async def progress_websocket(websocket: WebSocket, job_id: str):
    await websocket.accept()
    _connections.setdefault(job_id, []).append(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive / absorb pings
    except WebSocketDisconnect:
        pass
    finally:
        if job_id in _connections:
            try:
                _connections[job_id].remove(websocket)
            except ValueError:
                pass
            if not _connections[job_id]:
                del _connections[job_id]
