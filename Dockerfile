FROM ubuntu:24.04 AS builder

ARG NODE_VERSION=22

RUN apt update && apt install curl golang-go zip -y

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

ENV NVM_DIR=/root/.nvm

RUN bash -c "source $NVM_DIR/nvm.sh && nvm install $NODE_VERSION"

COPY . /build

WORKDIR /build

RUN bash -c "source $NVM_DIR/nvm.sh && exec npm i"

RUN bash -c "source $NVM_DIR/nvm.sh && exec npm run build"

WORKDIR /build/distribution

RUN zip -r autowwwleak.zip .

FROM scratch AS export

COPY --from=builder /build/distribution/autowwwleak.zip .
