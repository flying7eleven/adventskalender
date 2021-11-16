# the container which is used to build the website
FROM debian:bullseye AS build

# ensure we have npm/node installed in the appropiate version
RUN apt update && \
    apt install -y npm

# copy the source files and build the website
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN npm ci
RUN npm run build

# configure the acutal container for running the backend
FROM nginx:latest

# ensure we have a .well-kown directory for file mounting of security.txt and others
RUN mkdir -p /usr/share/nginx/html/.well-known

# modify the configuration for the server to be able to be used with React and React Router DOM
COPY docker/default.conf /etc/nginx/conf.d/default.conf

# copy the files for running the container
COPY --from=build --chown=1001 /usr/src/app/build /usr/share/nginx/html
