FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S fnc && adduser -S appuser -u 1001 -G fnc
COPY --from=builder --chown=appuser:fnc /app/.next/standalone ./
COPY --from=builder --chown=appuser:fnc /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:fnc /app/public ./public
USER appuser
EXPOSE 3000
CMD ["node", "server.js"]
