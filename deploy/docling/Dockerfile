FROM python:3.12-slim
RUN pip install --no-cache-dir docling fastapi uvicorn python-multipart
COPY server.py /app/server.py
WORKDIR /app
CMD ["uvicorn","server:app","--host","0.0.0.0","--port","5001"]
