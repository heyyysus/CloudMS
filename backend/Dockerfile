FROM node:krypton AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:krypton AS prod-deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:krypton-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY drizzle.config.ts ./
COPY src ./src
COPY package*.json ./

# Backfill any legacy null org_id before push, since push is what emits
# SET NOT NULL on those columns and would otherwise fail outright against a
# live database still holding one. Then push the schema, (re)grant the app
# role, and bootstrap PLATFORM_OWNER_EMAIL if set, before serving. drizzle-kit
# push reads schema.ts from source at runtime, which is why src/ and
# drizzle.config.ts are copied in above; drizzle-kit itself is resolvable
# because it's a runtime dependency (see package.json).
CMD ["sh", "-c", "node dist/db/extensions.js && node dist/db/backfillOrgIds.js && npx drizzle-kit push --force && node dist/db/roles.js && node dist/db/bootstrap.js && node dist/index.js"]
