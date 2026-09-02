FROM node:20-alpine

# better-sqlite3 needs build tools to compile its native binding on install
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server.js ./
COPY lib ./lib
COPY routes ./routes
COPY public ./public
COPY standalone-template ./standalone-template

ENV DATA_DIR=/app/data
ENV PORT=5000
EXPOSE 5000

CMD ["node", "server.js"]
