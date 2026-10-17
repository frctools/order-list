FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN npm install --global bun@1.4.2

# Vendord imports shared modules and packages from the repository root.
COPY package.json bun.lock bunfig.toml .npmrc ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY vendord/package.json vendord/package-lock.json ./vendord/
RUN npm ci --prefix vendord

COPY server/utils ./server/utils
COPY vendord ./vendord
RUN npm run build --prefix vendord

FROM node:22-bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/frctools/order-list"
ENV NODE_ENV=production \
    TZ=UTC \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/vendord/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
