# Build stage using Debian with Rust (for compatibility)
FROM rust:1.84-bookworm AS build

# Install only essential build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq-dev \
        git \
    && rm -rf /var/lib/apt/lists/*

# Copy source files and build in release mode
# Copy the whole repository to preserve git version information
COPY . /usr/src/app
WORKDIR /usr/src/app/adventskalender-backend

# Build with optimizations for size
# - opt-level=z: optimize for binary size
# - lto=true: link-time optimization
# - codegen-units=1: better optimization (slower build)
# - strip=true: strip debug symbols
ENV CARGO_PROFILE_RELEASE_OPT_LEVEL=z
ENV CARGO_PROFILE_RELEASE_LTO=true
ENV CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1
ENV CARGO_PROFILE_RELEASE_STRIP=true

RUN cargo build --release

# Runtime stage using minimal Debian slim image
FROM debian:bookworm-slim

# Install only runtime dependencies
# - libpq5: PostgreSQL client library (runtime only)
# - curl: Required for Docker healthcheck
# - ca-certificates: For HTTPS connections
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -u 1001 -m -s /bin/bash adventskalender

# Copy the optimized binary from build stage
COPY --from=build --chown=adventskalender:adventskalender \
    /usr/src/app/adventskalender-backend/target/release/adventskalender-backend \
    /usr/local/bin/adventskalender-backend

# Set working directory and switch to non-root user
WORKDIR /usr/local/bin
USER adventskalender

# Expose the backend port
EXPOSE 5479/tcp

# Start the backend
CMD ["/usr/local/bin/adventskalender-backend"]
