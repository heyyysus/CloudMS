FROM node:krypton

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# This is what tells Docker how to start your app
CMD ["npm", "start"]