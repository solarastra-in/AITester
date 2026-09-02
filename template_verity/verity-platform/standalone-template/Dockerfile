FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY data ./data
ENV DATA_DIR=/app/data
ENV PORT=4100
EXPOSE 4100
CMD ["node", "server.js"]
