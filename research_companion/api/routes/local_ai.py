import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, Field

from generation.local_reasoner import LocalReasoner

router = APIRouter(prefix="/local-ai", tags=["local-ai"])

_PULL_JOBS: dict[str, dict[str, Any]] = {}


class PullRequest(BaseModel):
    model: str = Field(..., min_length=1)


class PullResponse(BaseModel):
    job_id: str
    status: str
    model: str


def _pull(job_id: str, model: str) -> None:
    _PULL_JOBS[job_id]["status"] = "downloading"
    _PULL_JOBS[job_id]["updated_at"] = _now()

    def progress(update: dict[str, Any]) -> None:
        completed = update.get("completed")
        total = update.get("total")
        percent = None
        if isinstance(completed, (int, float)) and isinstance(total, (int, float)) and total:
            percent = round((completed / total) * 100, 1)
        _PULL_JOBS[job_id].update(
            {
                "status": "downloading",
                "ollama_status": update.get("status", "downloading"),
                "completed": completed,
                "total": total,
                "percent": percent,
                "updated_at": _now(),
            }
        )

    result = LocalReasoner().pull_model(model, on_progress=progress)
    _PULL_JOBS[job_id]["result"] = result
    _PULL_JOBS[job_id]["status"] = "done" if result.get("ok") else "failed"
    _PULL_JOBS[job_id]["error"] = "" if result.get("ok") else result.get("status", "unknown error")
    _PULL_JOBS[job_id]["updated_at"] = _now()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/status")
async def status() -> dict[str, Any]:
    return LocalReasoner().status()


@router.post("/pull", response_model=PullResponse)
async def pull(req: PullRequest, background_tasks: BackgroundTasks) -> PullResponse:
    job_id = str(uuid.uuid4())
    reasoner = LocalReasoner()
    if not reasoner.server_running():
        _PULL_JOBS[job_id] = {
            "status": "failed",
            "model": req.model,
            "error": "Ollama is not running. Start the Ollama app first.",
            "result": None,
            "updated_at": _now(),
        }
        return PullResponse(job_id=job_id, status="failed", model=req.model)

    _PULL_JOBS[job_id] = {
        "status": "queued",
        "model": req.model,
        "error": "",
        "result": None,
        "ollama_status": "queued",
        "completed": None,
        "total": None,
        "percent": None,
        "updated_at": _now(),
    }
    background_tasks.add_task(_pull, job_id, req.model)
    return PullResponse(job_id=job_id, status="queued", model=req.model)


@router.get("/pull/{job_id}")
async def pull_status(job_id: str) -> dict[str, Any]:
    return _PULL_JOBS.get(job_id, {"status": "missing", "error": "Job not found"})
