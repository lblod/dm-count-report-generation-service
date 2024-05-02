
#Build stage
FROM node:iron-alpine AS build

WORKDIR /app

COPY package*.json .
COPY .npmrc .

RUN npm install --no-audit

COPY . .

RUN npm run build

#Production stage
FROM node:iron-alpine AS production

WORKDIR /app

COPY package*.json .

RUN npm ci --only=production --no-audit

COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.js"]
