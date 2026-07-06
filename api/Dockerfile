FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY api/package.json ./api/package.json
COPY packages/shared ./packages/shared
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache bash docker-cli git
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/api/dist ./dist
COPY --from=build /app/packages ./packages
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/api/package.json ./package.json
EXPOSE 4000
CMD ["node", "dist/main.js"]
