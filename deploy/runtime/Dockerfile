FROM node:22-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends git openscad python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/runtime
COPY dist ./dist
COPY schemas ./schemas
COPY proto ./proto
COPY scripts/cad-to-gltf.py ./scripts/cad-to-gltf.py
COPY package.json ./package.json
ENTRYPOINT ["node", "/opt/runtime/dist/src/cli/main.js"]
CMD ["doctor"]
