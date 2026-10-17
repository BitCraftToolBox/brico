# Build context is the REPO ROOT, not this directory — npm workspaces means the lockfile and the
# common/ packages this depends on live outside backend/brico-bot/. Build from the repo root with:
#   docker build -f backend/brico-bot/Dockerfile -t brico-bot .
FROM node:24-alpine

LABEL org.opencontainers.image.source="https://github.com/BitCraftToolBox/brico"

WORKDIR /app

COPY package.json package-lock.json ./
COPY common/bindings common/bindings
COPY common/crafts common/crafts
COPY common/bitcraft-bindings common/bitcraft-bindings
COPY backend/brico-bot backend/brico-bot

# `frontend` is a declared workspace too, but npm workspaces silently skips a workspace glob entry
# with no package.json at that path
RUN npm ci --omit=dev && npm cache clean --force

WORKDIR /app/backend/brico-bot
RUN mkdir -p .state && chown -R node:node .state
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${BRICO_BOT_HTTP_PORT:-8080}/healthz" || exit 1

ENTRYPOINT ["npx", "tsx", "src/main.ts"]
