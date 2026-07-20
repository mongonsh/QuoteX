FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY server ./server
COPY src ./src
COPY tests ./tests
COPY tools ./tools
RUN npm run build

FROM node:22-alpine AS production-dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=9000

WORKDIR /app

COPY index.html ./
COPY assets ./assets
COPY src/styles.css ./src/styles.css
COPY --from=build /app/dist ./dist
COPY --from=production-dependencies /app/node_modules ./node_modules

USER node

EXPOSE 9000

CMD ["node", "dist/tools/serve.js"]
