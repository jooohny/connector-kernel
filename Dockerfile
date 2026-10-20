# ---- build: full toolchain. dist/ is src/ compiled, dist-migrations/ is migrations/ ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json tsconfig.migrations.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build

# ---- deps: production dependencies, no devDependencies ----
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- runtime: everything both images share, so they share the layers too ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# ---- migrate: the same runtime plus the migrations. Runs once, before any api instance ----
FROM runtime AS migrate

COPY --from=build /app/dist-migrations ./migrations

USER node
CMD ["node", "node_modules/typeorm/cli.js", "migration:run", "-d", "dist/modules/payments/infrastructure/persistence/database/data-source.js"]

# ---- api: the service, and the default build target. Carries no migrations, so it
#      cannot change its own schema. Stays LAST: `docker build .` with no --target
#      builds the final stage, and that has to be the thing you deploy ----
FROM runtime AS api

USER node
CMD ["node", "dist/main.js"]
