FROM node:20.18.0-alpine3.20 AS deps
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
COPY api/package.json ./api/package.json
COPY packages/shared ./packages/shared
RUN npm ci

FROM node:20.18.0-alpine3.20 AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
COPY packages/shared ./packages/shared
RUN npm ci --omit=dev

FROM node:20.18.0-alpine3.20 AS build
WORKDIR /app
COPY --from=deps /app/ ./
COPY . .
RUN npm run build -w api

FROM node:20.18.0-alpine3.20
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache bash docker-cli git \
  && addgroup --system shore \
  && adduser --system --ingroup shore shore
COPY --from=production-deps --chown=shore:shore /app/node_modules ./node_modules
COPY --from=build --chown=shore:shore /app/api/dist ./dist
COPY --from=build --chown=shore:shore /app/packages ./packages
COPY --from=build --chown=shore:shore /app/scripts ./scripts
COPY --from=build --chown=shore:shore /app/api/package.json ./package.json
USER shore
EXPOSE 4000
CMD ["node", "dist/main.js"]
