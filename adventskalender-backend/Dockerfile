# Build stage using Debian with Rust (for compatibility)
FROM rust:1.99.1-trixie AS build

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

# The distroless runtime image does not ship libpq and its transitive runtime dependencies
# (Kerberos, LDAP and SASL), so they are extracted from a matching Debian release. The libraries
# keep their multiarch directory name below /usr/lib, which keeps the build independent of the
# target architecture, since dpkg reports arm64 for the directory name aarch64-linux-gnu and
# BuildKit reports amd64 for x86_64-linux-gnu. Libraries which the distroless image already
# ships, above all glibc, are skipped so the loader and its libraries keep coming from one
# consistent build.
FROM debian:trixie-slim AS runtime-libraries
RUN set -eu && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq5 \
    && rm -rf /var/lib/apt/lists/* && \
    libpq=$(dpkg -L libpq5 | grep 'libpq\.so\.5$' | head -n1) && \
    test -n "$libpq" && \
    mkdir -p /libraries-root && \
    for library in "$libpq" $(ldd "$libpq" | awk '/=> \// { print $3 }'); do \
        case $(basename "$library") in \
            libc.so.*|libm.so.*|libresolv.so.*|libssl.so.*|libcrypto.so.*|libz.so.*|libzstd.so.*) \
                continue ;; \
        esac; \
        directory=$(basename $(dirname "$library")); \
        mkdir -p "/libraries-root/$directory"; \
        cp --dereference "$library" "/libraries-root/$directory/$(basename "$library")"; \
    done

# Create the data directory for the token signing key in a stage which has a shell, since the
# distroless runtime stage cannot. It keeps the UID of the previous image so existing volumes
# remain usable without a migration, a numeric USER needs no passwd entry.
RUN mkdir /data && chown 1001:1001 /data

# Runtime stage using the distroless image
# - cc: ships the glibc runtime which the Rust binary and libpq are linked against
# - nonroot: the backend runs with the unprivileged UID 1001 below
FROM gcr.io/distroless/cc-debian13:nonroot

# The libraries keep their multiarch directory layout below /usr/lib, so the loader finds them
# on its default search path without any environment variable. They stay owned by root so the
# runtime user cannot replace them. The data directory for the token signing key is created
# with the ownership of the runtime user so the volume adopts it; both need a build stage since
# distroless has no shell for creating them at runtime.
COPY --from=runtime-libraries /libraries-root /usr/lib
COPY --from=runtime-libraries --chown=1001:1001 /data /data
COPY --from=build \
    /usr/src/app/adventskalender-backend/target/release/adventskalender-backend \
    /usr/local/bin/adventskalender-backend

# Set working directory, the numeric user keeps existing volumes from the previous image usable
WORKDIR /usr/local/bin
USER 1001:1001

# Expose the backend port
EXPOSE 5479/tcp

# Start the backend
CMD ["/usr/local/bin/adventskalender-backend"]
