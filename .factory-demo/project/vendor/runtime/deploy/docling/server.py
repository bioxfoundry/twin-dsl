from fastapi import FastAPI, UploadFile
from docling.document_converter import DocumentConverter
import tempfile, pathlib
app=FastAPI(); converter=DocumentConverter()
@app.get('/health')
def health(): return {'ok':True}
@app.post('/convert')
async def convert(file:UploadFile):
    suffix=pathlib.Path(file.filename or 'input.bin').suffix
    with tempfile.NamedTemporaryFile(suffix=suffix) as f:
        f.write(await file.read()); f.flush(); result=converter.convert(f.name)
        return {'markdown':result.document.export_to_markdown(),'converter':'docling'}
