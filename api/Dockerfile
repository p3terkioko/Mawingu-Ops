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

# Apply idempotent migrations, seed demo data (idempotent; guarded so it never
# clobbers real pipeline output), then start. Seeding on boot means a free-tier
# deploy needs no Render Shell to populate the database. A seed failure is
# non-fatal so the service still starts.
CMD ["sh", "-c", "npm run migrate && (npm run seed:demo || echo '[boot] seed skipped') && npm start"]
