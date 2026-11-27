# Build stage using official Node.js image
FROM node:26-trixie-slim AS build

# Set working directory
WORKDIR /usr/src/app

# Copy package files first for better layer caching
# This allows Docker to cache npm install if dependencies haven't changed
COPY package*.json ./

# Install dependencies with clean install for reproducible builds
# --omit=dev is not used because build requires devDependencies (TypeScript, Vite, etc.)
RUN npm ci

# Copy source code
COPY . .

# Build the application into the 'build' directory (see outDir in vite.config.mts)
RUN npm run build

# Runtime stage using the official nginx alpine image
FROM nginx:1.30-alpine

# Copy custom nginx configuration
COPY docker/default.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf

# Copy built static files from build stage
# Note: nginx master process runs as root, worker processes as nginx user
COPY --from=build /usr/src/app/build /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# The image's /docker-entrypoint.sh stays the entrypoint; nginx handles signals itself as PID 1
CMD ["nginx", "-g", "daemon off;"]
