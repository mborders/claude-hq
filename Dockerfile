# syntax=docker/dockerfile:1.7

############################
# Stage 1 — build everything
############################
FROM node:22-alpine AS build
WORKDIR /app
# Manifests first for layer caching.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

############################
# Stage 2 — production deps only
############################
FROM node:22-alpine AS proddeps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

############################
# Stage 3 — slim runtime
############################
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=7878 \
    APP_DATA_DIR=/data \
    CLAUDE_HOME_DIR=/host/claude-home \
    PROJECTS_ROOTS=/host/projects \
    WEB_DIST_DIR=/app/web/dist
WORKDIR /app

COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=proddeps /app/node_modules ./node_modules

# Mount points. /data is bind-mounted at runtime (host-owned on Docker Desktop);
# the container also runs as the host uid:gid via compose `user:` so writes land
# with correct ownership.
RUN mkdir -p /data /host/claude-home /host/projects && chown -R node:node /data
USER node

EXPOSE 7878
HEALTHCHECK --interval=15s --timeout=3s --start-period=8s --retries=3 \
  CMD wget -qO- http://127.0.0.1:7878/api/health || exit 1

CMD ["node", "server/dist/server.cjs"]
