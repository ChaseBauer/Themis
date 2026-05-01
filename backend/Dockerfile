FROM rust:latest as builder
RUN apt-get update && apt-get install -y pkg-config libssl-dev libssh2-1-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo 'fn main(){}' > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
COPY migrations ./migrations
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl3 libssh2-1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/themis-backend .
COPY --from=builder /app/migrations ./migrations
EXPOSE 8080
CMD ["./themis-backend"]
