# ============================================================
# Node.js/Express Backend — Dockerfile
# ============================================================
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling in containers
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/


# Azure App Service injects PORT, but default to 3001
ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
