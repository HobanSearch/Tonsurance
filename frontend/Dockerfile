# Tonsurance Frontend Dockerfile
# Multi-stage build for optimized production bundle

# Stage 1: Build
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy root package files for wrapper dependencies
COPY package.json package-lock.json* ./

# Install root dependencies (for wrappers)
RUN npm install --legacy-peer-deps

# Copy wrappers (needed for contract imports)
COPY wrappers ./wrappers

# Copy frontend package files
COPY frontend/package.json frontend/package-lock.json* ./frontend/

# Install frontend dependencies
WORKDIR /app/frontend
RUN npm install --legacy-peer-deps

# Copy frontend source code
COPY frontend .

# Build for production (skip strict type checking for now)
RUN npx vite build

# Stage 2: Production with nginx
FROM nginx:alpine

# Copy nginx configuration
COPY frontend/nginx.conf /etc/nginx/nginx.conf

# Copy built files from builder
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
