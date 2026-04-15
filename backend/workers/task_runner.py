"""ProcessPoolExecutor wrapper for running blocking FFmpeg tasks."""
from __future__ import annotations

import asyncio
from concurrent.futures import ProcessPoolExecutor
from typing import Any, Callable, Optional

_executor: Optional[ProcessPoolExecutor] = None


def get_executor(max_workers: int = 3) -> ProcessPoolExecutor:
    """Lazy singleton ProcessPoolExecutor."""
    global _executor
    if _executor is None:
        _executor = ProcessPoolExecutor(max_workers=max_workers)
    return _executor


async def run_in_executor(func: Callable, *args: Any) -> Any:
    """Run a blocking function in the process pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(get_executor(), func, *args)


def shutdown_executor() -> None:
    """Gracefully shut down the executor."""
    global _executor
    if _executor is not None:
        _executor.shutdown(wait=True)
        _executor = None
