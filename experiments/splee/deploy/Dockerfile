# Experimental Splee backend image; requires reviewed upstream commit SHA at build time.
FROM rust:1.93-bookworm AS build
ARG SPLEE_REF
RUN test -n "$SPLEE_REF"
RUN apt-get update && apt-get install -y --no-install-recommends git pkg-config libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone https://github.com/Iweisc/splee.git . && git checkout --detach "$SPLEE_REF"
WORKDIR /src/backend
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 10001 splee
COPY --from=build /src/backend/target/release/splee /usr/local/bin/splee
USER splee
EXPOSE 8787
ENTRYPOINT ["/usr/local/bin/splee"]
