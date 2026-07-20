FROM node:20.18.0-alpine3.20
WORKDIR /app
COPY package.json package-lock.json ./
COPY workers/worker-node/package.json ./workers/worker-node/package.json
COPY packages/shared ./packages/shared
RUN npm ci --omit=dev -w workers/worker-node \
  && addgroup --system shore \
  && adduser --system --ingroup shore shore
COPY --chown=shore:shore workers/worker-node/src ./workers/worker-node/src
USER shore
CMD ["node", "workers/worker-node/src/index.js"]
