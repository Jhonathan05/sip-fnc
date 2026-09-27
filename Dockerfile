# Plantilla FNC perfil rendimiento — Express 4 en node:22-alpine
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src/ ./src/
COPY public/ ./public/
ENV NODE_ENV=production
EXPOSE 3020
CMD ["node", "src/server.js"]
