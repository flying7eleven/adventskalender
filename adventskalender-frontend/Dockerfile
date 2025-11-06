# Build stage using official Node.js image
FROM node:23.2.0-bookworm-slim AS build

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

# Build the application
# Vite will output to 'build' directory (or 'dist' - adjust if needed)
RUN npm run build

# Runtime stage using minimal nginx alpine image
FROM nginx:1.27-alpine

# Install dumb-init for proper signal handling (optional but recommended)
RUN apk add --no-cache dumb-init

# Copy custom nginx configuration
COPY docker/default.conf /etc/nginx/conf.d/default.conf

# Copy built static files from build stage
# Note: nginx master process runs as root, worker processes as nginx user
COPY --from=build /usr/src/app/build /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
