FROM node:20.18.0-alpine3.20@sha256:b1e0880c3af955867bc2f1944b49d20187beb7afa3f30173e15a97149ab7f5f1 AS dependencies
WORKDIR /src
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
COPY workers/worker-node/package.json workers/worker-node/package.json
COPY packages/shared packages/shared
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run api:build && npm run web:build

FROM node:20.18.0-alpine3.20@sha256:b1e0880c3af955867bc2f1944b49d20187beb7afa3f30173e15a97149ab7f5f1 AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PATH=/opt/shore-sentinel/bin:/usr/local/bin:/usr/bin:/bin:/sbin:/usr/sbin
WORKDIR /opt/shore-sentinel
RUN apk add --no-cache \
      bash \
      ca-certificates \
      curl \
      postgresql16 \
      postgresql16-client \
      postgresql16-contrib \
      python3 \
      redis \
      su-exec \
      supervisor \
  && addgroup -S shore-web && adduser -S -G shore-web shore-web \
  && addgroup -S shore-api && adduser -S -G shore-api shore-api \
  && addgroup -S shore-worker && adduser -S -G shore-worker shore-worker \
  && addgroup -S shore-parser && adduser -S -G shore-parser shore-parser \
  && addgroup -S shore-postgres && adduser -S -G shore-postgres shore-postgres \
  && addgroup -S shore-redis && adduser -S -G shore-redis shore-redis \
  && addgroup -S shore-minio && adduser -S -G shore-minio shore-minio \
  && mkdir -p /var/lib/shore-sentinel/postgres /var/lib/shore-sentinel/redis /var/lib/shore-sentinel/object-storage /var/lib/shore-sentinel/evidence /var/log/shore-sentinel \
  && chown -R shore-postgres:shore-postgres /var/lib/shore-sentinel/postgres \
  && chown -R shore-redis:shore-redis /var/lib/shore-sentinel/redis \
  && chown -R shore-minio:shore-minio /var/lib/shore-sentinel/object-storage \
  && chown -R shore-parser:shore-parser /var/lib/shore-sentinel/evidence
# MinIO is an application dependency, not a sibling container. The release is pinned by URL and checksum.
ARG TARGETARCH
ARG MINIO_VERSION=20241218131544.0.0
ARG MINIO_SHA256_AMD64=b160222fc0528b362f6f539b25752ea1d88073a71c82646581c193cdd21d8334
ARG MINIO_SHA256_ARM64=37697eb39a9e7b704445a3460ced16f64e0b5704242eb505afb65a168122b9e9
RUN case "$TARGETARCH" in amd64) MINIO_ARCH=amd64; MINIO_PACKAGE_ARCH=x86_64; MINIO_SHA256="$MINIO_SHA256_AMD64" ;; arm64) MINIO_ARCH=aarch64; MINIO_PACKAGE_ARCH=aarch64; MINIO_SHA256="$MINIO_SHA256_ARM64" ;; *) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; esac \
  && curl -fsSL "https://dl.min.io/server/minio/release/linux-${MINIO_ARCH}/archive/minio_${MINIO_VERSION}_${MINIO_PACKAGE_ARCH}.apk" -o /tmp/minio.apk \
  && echo "${MINIO_SHA256}  /tmp/minio.apk" | sha256sum -c - \
  && apk add --no-cache --allow-untrusted /tmp/minio.apk \
  && rm /tmp/minio.apk
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/api/dist ./api/dist
COPY --from=build /src/api/package.json ./api/package.json
COPY --from=build /src/api/migrations ./api/migrations
COPY --from=build /src/packages ./packages
COPY --from=build /src/web/.next/standalone ./web
COPY --from=build /src/web/.next/static ./web/web/.next/static
COPY --from=build /src/web/public ./web/web/public
COPY --from=build /src/workers/worker-node/src ./workers/worker-node/src
COPY --from=build /src/workers/worker-node/package.json ./workers/worker-node/package.json
COPY --from=build /src/workers/worker-python/src ./workers/worker-python/src
COPY container/entrypoint.sh container/healthcheck.sh container/capability-check.sh container/run-process.sh container/backup-restore.sh container/object-storage-bootstrap.mjs container/shore-sentinel ./bin/
COPY container/supervisord.conf /etc/supervisord.conf
COPY container/process-environment-contract.json ./process-environment-contract.json
RUN chmod 0755 ./bin/*.sh ./bin/shore-sentinel \
  && chmod 0644 ./bin/object-storage-bootstrap.mjs \
  && chown shore-api:shore-api ./bin/object-storage-bootstrap.mjs \
  && chown -R shore-web:shore-web ./web \
  && chown -R shore-api:shore-api ./api ./packages \
  && chown -R shore-worker:shore-worker ./workers/worker-node \
  && chown -R shore-parser:shore-parser ./workers/worker-python
EXPOSE 3010 4000
ENTRYPOINT ["/opt/shore-sentinel/bin/entrypoint.sh"]
