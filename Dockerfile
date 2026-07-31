# MawinguOps — single-image deploy: builds the React dashboard and serves it
# from the Node API (same origin, no CORS). Render finds this at the repo root
# with its default settings (Dockerfile path ./Dockerfile, context = repo root).

# --- Stage 1: build the React dashboard --------------------------------------
FROM node:20-slim AS dashboard
WORKDIR /dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ ./
# Empty base => the app calls the API on its own origin (see src/App.jsx).
ENV VITE_API_BASE=""
RUN npm run build

# --- Stage 2: API + the built dashboard as static files ----------------------
FROM node:20-slim
WORKDIR /app
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY api/src ./src
# The Express app serves ./public when it exists (see src/index.js).
COPY --from=dashboard /dashboard/dist ./public

ENV NODE_ENV=production
EXPOSE 3000

# Apply idempotent migrations, then start. Seed demo data separately with
# `npm run seed:demo` so it is an explicit, one-off action.
CMD ["sh", "-c", "npm run migrate && npm start"]
