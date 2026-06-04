from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("/pdf")
async def pdf(path: str = Query(..., min_length=1)) -> FileResponse:
    pdf_path = Path(path).expanduser().resolve()
    if not pdf_path.exists() or not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="PDF not found")
    if pdf_path.suffix.lower() != ".pdf":
        raise HTTPException(status_code=415, detail="Only PDF files can be previewed")
    encoded_name = quote(pdf_path.name, safe="")
    return FileResponse(
        str(pdf_path),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{encoded_name}"},
    )
