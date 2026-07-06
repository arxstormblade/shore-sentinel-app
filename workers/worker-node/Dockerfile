FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY workers/worker-node/package.json ./workers/worker-node/package.json
COPY packages/shared ./packages/shared
RUN npm install --omit=dev -w workers/worker-node
COPY workers/worker-node/src ./workers/worker-node/src
CMD ["node", "workers/worker-node/src/index.js"]
