FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
# Chromium a PDF-rendereléshez (a playwright csomag verziójához illő böngésző)
RUN npx playwright install --with-deps chromium
COPY . .
ENV NODE_ENV=production
CMD ["node", "src/server.js"]
