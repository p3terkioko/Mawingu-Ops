# MawinguOps API — Node 20 (Express + pg + Africa's Talking USSD webhook).
# Portable image for Render / Railway / Fly / any container host.
FROM node:20-slim

WORKDIR /app

# Install production deps first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source.
COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

# Apply idempotent migrations, then start. Seed demo data separately with
# `npm run seed:demo` so it is an explicit, one-off action.
CMD ["sh", "-c", "npm run migrate && npm start"]
