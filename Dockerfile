FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# What the cleanup service in docker-compose.yml prunes by. Without a label of
# our own, the only way to drop old builds is `docker image prune -a`, which
# would also take every unused image on the box that has nothing to do with
# this game.
LABEL app=superchameleon

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/src ./src

USER node
EXPOSE 3000
CMD ["node", "src/server/index.ts"]