# the container which is used to build the website
FROM debian:bookworm AS build

# set the variables to determin which NodeJS version will be installed
ENV NODE_VERSION=23.2.0
ENV NVM_DIR=/root/.nvm
ENV PATH=$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

# install nvm with node and npm
RUN mkdir -p $NVM_DIR \
    && apt update  \
    && apt install -y curl git \
    && git clone https://github.com/nvm-sh/nvm.git $NVM_DIR \
    && . $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default

# copy the source files and build the website
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN npm ci
RUN npm run build

# configure the acutal container for running the backend
FROM nginx:latest

# modify the configuration for the server to be able to be used with React and React Router DOM
COPY docker/default.conf /etc/nginx/conf.d/default.conf

# copy the files for running the container
COPY --from=build --chown=1001 /usr/src/app/build /usr/share/nginx/html
