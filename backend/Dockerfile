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

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# This is what tells Docker how to start your app
CMD ["npm", "start"]
