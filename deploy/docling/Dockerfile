# syntax=docker/dockerfile:1.7
#
# Cacheable build. Three things make repeat builds fast:
#   1. BuildKit cache mounts keep pip's HTTP/wheel cache between builds. `--no-cache-dir` (the
#      previous setting) actively defeated this, so every build re-downloaded gigabytes.
#   2. torch comes from the CPU-only index. docling pulls it transitively, and the default index
#      resolves to CUDA builds dragging in ~3 GB of nvidia_* wheels this CPU service never uses.
#   3. Dependencies are copied and installed before the application code, so editing server.py
#      reuses the dependency layer instead of rebuilding it.
FROM python:3.12-slim

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # torch's inductor backend shells out to a C++ compiler at runtime, which a slim image does not
    # ship: conversions fail with "InvalidCxxCompiler: No working C++ compiler found". Eager mode
    # needs no toolchain, and these models are small enough that compilation buys little.
    TORCHDYNAMO_DISABLE=1 \
    TORCH_COMPILE_DISABLE=1 \
    # Keep model weights on the mounted cache volume so they survive container recreation.
    HF_HOME=/root/.cache/huggingface

# CPU-only torch first, so the resolver in the next step already has it satisfied.
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision

COPY requirements.txt /tmp/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip install -r /tmp/requirements.txt \
    # docling pulls opencv-python (the GUI build), which links against libxcb/libGL — absent from
    # python:*-slim, so `import cv2` fails and every conversion returns HTTP 500 while /health still
    # answers OK. Both distributions own the same `cv2` directory, so they must be swapped in
    # order: removing the GUI build deletes the shared files, then headless is reinstalled last.
    && pip uninstall -y opencv-python opencv-contrib-python \
    && pip install --force-reinstall --no-deps opencv-python-headless \
    && python -c "import cv2; print('cv2 ok', cv2.__version__)"

WORKDIR /app
COPY server.py /app/server.py

EXPOSE 5001
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5001"]
