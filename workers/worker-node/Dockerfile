FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 git
COPY package.json ./
COPY workers/worker-node/package.json ./workers/worker-node/package.json
COPY packages/shared ./packages/shared
RUN npm install --omit=dev -w workers/worker-node
COPY . .
CMD ["node", "workers/worker-node/src/index.js"]
