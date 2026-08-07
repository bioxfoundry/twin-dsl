FROM node:22-bookworm-slim
WORKDIR /opt/runtime
COPY dist ./dist
COPY schemas ./schemas
COPY proto ./proto
COPY package.json ./package.json
ENTRYPOINT ["node", "/opt/runtime/dist/src/cli/main.js"]
