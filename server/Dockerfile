# ============================================================
# Node.js/Express Backend — Dockerfile
# ============================================================
# Node 22, not 20: @supabase/* (>=2.115) and firebase-admin (>=14) both
# declare `engines.node >= 22`. On node:20 every install logs EBADENGINE and
# those packages run unsupported -- which for Supabase means the DB, auth and
# storage clients all sit on an engine their authors do not test.
FROM node:22-alpine AS production

# Install dumb-init for proper signal handling in containers
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy source code
COPY src/ ./src/


# Azure App Service injects PORT, but default to 3001
ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
