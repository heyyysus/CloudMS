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

# Four steps prepare the live database before the schema is pushed, because
# push on its own cannot handle any of them against existing rows:
#   backfillOrgIds        - push emits SET NOT NULL on org_id, which fails
#                           outright while any row still holds a NULL.
#   backfillDocumentNumbers - carries each org's invoice/receipt counter past
#                           the numbers its rows already use, so the first
#                           document created after boot is not handed one
#                           that is taken.
#   ensureUniqueConstraints - push prompts (before it consults --force)
#                           before adding a unique constraint to a populated
#                           table, and a container has no TTY to answer on.
#                           Creating them here leaves push nothing to ask.
#   push                  - drizzle-kit push behind a guard, because push
#                           exits 0 even when it failed to apply anything.
# Then (re)grant the app role and bootstrap PLATFORM_OWNER_EMAIL if set,
# before serving. drizzle-kit push reads schema.ts from source at runtime,
# which is why src/ and drizzle.config.ts are copied in above; drizzle-kit
# itself is resolvable because it's a runtime dependency (see package.json).
CMD ["sh", "-c", "node dist/db/extensions.js && node dist/db/backfillOrgIds.js && node dist/db/backfillDocumentNumbers.js && node dist/db/ensureUniqueConstraints.js && node dist/db/push.js && node dist/db/roles.js && node dist/db/bootstrap.js && node dist/index.js"]
