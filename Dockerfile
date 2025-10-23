# Tonsurance Backend Dockerfile
# Multi-stage build for optimized production image

# Stage 1: Build
FROM ocaml/opam:alpine-ocaml-5.1 AS builder

# Install system dependencies
RUN sudo apk add --no-cache \
    gcc \
    g++ \
    make \
    m4 \
    postgresql-dev \
    gmp-dev \
    libffi-dev \
    openblas-dev \
    lapack-dev \
    gsl-dev \
    pkgconfig \
    libev-dev \
    openssl-dev \
    linux-headers \
    zlib-dev

# Set environment variables for musl libc compatibility
ENV C_INCLUDE_PATH=/usr/include:/usr/local/include
ENV LIBRARY_PATH=/usr/lib:/usr/local/lib
ENV LIBEV_CFLAGS="-I/usr/include"
ENV LIBEV_LIBS="-L/usr/lib -lev"
ENV PKG_CONFIG_PATH=/usr/lib/pkgconfig:/usr/local/lib/pkgconfig

# Set working directory
WORKDIR /app

# Copy backend directory
COPY backend ./

# Fix permissions (macOS restrictive permissions cause build failures)
RUN sudo chmod -R 755 /app

# Install OCaml dependencies (install lwt without libev first, then with)
RUN opam install -y yojson logs && \
    opam install -y conf-libev && \
    opam install -y lwt lwt_ppx && \
    opam install -y redis redis-lwt cryptokit && \
    opam install -y core dream cohttp-lwt-unix caqti caqti-lwt caqti-driver-postgresql ppx_sexp_conv ppx_deriving_yojson ppx_yojson_conv ppx_jane

# Build the project
RUN eval $(opam env) && dune build --release

# Stage 2: Runtime
FROM alpine:3.18

# Install runtime dependencies
RUN apk add --no-cache \
    gmp \
    libffi \
    postgresql-client \
    openblas \
    lapack \
    gsl \
    ca-certificates \
    bash \
    libev \
    zlib

# Create app user
RUN addgroup -g 1000 tonsurance && \
    adduser -D -u 1000 -G tonsurance tonsurance

# Set working directory
WORKDIR /app

# Create bin directory for executables
RUN mkdir -p /app/bin

# Copy built executables from builder (with conditional fallback)
RUN --mount=type=bind,from=builder,source=/app/_build/default/api,target=/tmp/api \
    cp /tmp/api/*.exe /app/bin/ 2>/dev/null || echo "No API executables found"
RUN --mount=type=bind,from=builder,source=/app/_build/default/daemons,target=/tmp/daemons \
    cp /tmp/daemons/*.exe /app/bin/ 2>/dev/null || echo "No daemon executables found"
# Note: Tonny executables excluded (separate Docker build)
# RUN --mount=type=bind,from=builder,source=/app/_build/default/tonny,target=/tmp/tonny \
#     cp /tmp/tonny/*.exe /app/bin/ 2>/dev/null || echo "No tonny executables found"

# Create necessary directories
RUN mkdir -p /app/logs && chown -R tonsurance:tonsurance /app

# Copy migrations
COPY backend/migrations /app/migrations

# Switch to app user
USER tonsurance

# Expose API port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Default command: sleep (will be overridden by docker-compose)
CMD ["sleep", "infinity"]
