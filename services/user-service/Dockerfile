# Multi-stage build for movemate user-service
# Build: compiles TypeScript and Prisma schema
# Runtime: production Node 20 Alpine with non-root user

FROM node:20-alpine AS builder

WORKDIR /app

# Copy monorepo root
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./

# Copy shared library
COPY shared ./shared

# Copy user-service
COPY services/user-service ./services/user-service

# Copy Prisma schema
COPY prisma ./prisma

# Install all dependencies (dev needed for build)
RUN npm ci --audit=false

# Generate Prisma client
RUN npx prisma generate

# Build shared library and user-service
RUN npm --workspace=shared run build
RUN npm --workspace=@movemate/user-service run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package.json package-lock.json ./

# Copy built files and schemas from builder
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/services/user-service ./services/user-service
COPY --from=builder /app/prisma ./prisma

# Install production dependencies only
RUN npm ci --omit=dev --audit=false && npm cache clean --force

# Switch to non-root user
USER nodejs

EXPOSE 3002

ENV NODE_ENV=production
ENV PORT=3002

# Healthcheck instruction for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/healthz', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "services/user-service/dist/index.js"]
