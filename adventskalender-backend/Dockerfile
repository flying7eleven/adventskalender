# use the same platform for building as we use for running the server
FROM debian:bullseye AS build

# ensure we have rust installed in the appropiate version
RUN apt update && \
    apt install -y curl build-essential libpq-dev git && \
    curl https://sh.rustup.rs -sSf | \
    sh -s -- --default-toolchain stable -y
ENV PATH=/root/.cargo/bin:$PATH

# copy the source files and build the backend in release-mode
# be sure to copy the whole repository to get the version information from git
COPY . /usr/src/app
WORKDIR /usr/src/app/adventskalender-backend
RUN cargo build --release

# configure the acutal container for running the backend
FROM debian:bullseye

# install the required dependencies
RUN apt update && \
    apt install -y libpq5 curl

# copy the files for running the container
COPY --from=build --chown=1001 /usr/src/app/adventskalender-backend/target/release/adventskalender-backend /usr/local/bin/adventskalender-backend

# set the work dir for the backend
WORKDIR /usr/local/bin

# configure the user(-id) for the running process
USER 1001

# expose the backend port
EXPOSE 5479/tcp

# startup the backend
CMD exec /usr/local/bin/adventskalender-backend
