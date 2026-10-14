# ClipForge (VideoEditor)

A **web-based video editor**. Upload a clip in the browser and trim, convert and
process it server-side with FFmpeg. A FastAPI backend handles the heavy lifting
while a React + TypeScript frontend provides a fast, drag-and-drop UI.

## Features
- Drag-and-drop uploads (`react-dropzone`) in a React/Vite UI
- FFmpeg-powered processing (trim/convert/export) via a FastAPI backend
- Client state with Zustand; REST API with live docs at `/docs`

## Stack
Python · FastAPI · FFmpeg · React · TypeScript · Vite

## Getting started
```bash
./run.sh            # starts backend (:8000) + frontend (:5173)
```
Requires **FFmpeg** installed (`brew install ffmpeg`).

## Notes
- Frontend: `frontend/` (Vite dev server on :5173). Backend: `backend/` (uvicorn on :8000).
