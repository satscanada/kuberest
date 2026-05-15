FROM node:20-alpine AS ui-builder

WORKDIR /ui

COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY config.yaml ./config.yaml
COPY --from=ui-builder /ui/dist ./src/ui

ENV NODE_ENV=production
ENV PORT=3000

USER node

EXPOSE 3000

CMD ["npm", "start"]
