# syntax=docker/dockerfile:1

# --- Stage 1: build the React UI ---------------------------------------------
FROM node:26-bookworm AS ui
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

# --- Stage 2: runtime ---------------------------------------------------------
# One image serves both the Express gateway (Node) and the verification core
# (Python), because the gateway spawns isolated Python workers per run.
FROM node:26-bookworm-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PORT=8080 \
    CERBERUS_ALLOW_MUTATION=false \
    CERBERUS_WS_ROOT=/tmp/cerb-ws \
    CERBERUS_MAX_WORKERS=2 \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/venv

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY --from=ui /app/node_modules ./node_modules
COPY --from=ui /app/dist         ./dist
COPY package.json package-lock.json ./
COPY server.ts ./
COPY backend ./backend

RUN useradd --create-home --shell /bin/bash cerberus \
 && mkdir -p /tmp/cerb-ws \
 && chown -R cerberus:cerberus /app /tmp/cerb-ws
USER cerberus

EXPOSE 8080
CMD ["npx", "tsx", "server.ts"]
