from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, HTTPException, UploadFile
from docling.document_converter import DocumentConverter

SUPPORTED_SUFFIXES = frozenset({
    ".pdf", ".docx", ".doc", ".odt", ".pptx", ".ppt", ".xlsx", ".xls", ".ods", ".odp", ".epub",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".tif", ".tiff", ".bmp",
})

app = FastAPI()
converter = DocumentConverter()


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/convert")
async def convert(file: UploadFile) -> dict[str, str]:
    suffix = Path(file.filename or "input.bin").suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(status_code=415, detail=f"UNSUPPORTED_DOCUMENT_KIND:{suffix or '<none>'}")
    with NamedTemporaryFile(suffix=suffix) as temp:
        temp.write(await file.read())
        temp.flush()
        result = converter.convert(temp.name)
        return {"markdown": result.document.export_to_markdown(), "converter": "docling"}
