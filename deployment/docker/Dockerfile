# UNAGENCY production base image — builds existing app without platform redesign.
# Target: node 20, commonjs dist from tsc.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY index.ts app.ts ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV SERVICE_ROLE=api
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r unagency && useradd -r -g unagency unagency
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY deployment/scripts ./deployment/scripts
RUN chmod +x /app/deployment/scripts/*.sh \
    && ln -sf /app/deployment/scripts/entrypoint.sh /entrypoint.sh \
    && ln -sf /app/deployment/scripts/healthcheck.sh /healthcheck.sh \
    && chown -R unagency:unagency /app
USER unagency
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["/healthcheck.sh"]
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
