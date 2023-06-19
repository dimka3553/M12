FROM node:20-alpine
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
RUN apk update && apk add git && \
    git clone https://github.com/dimka3553/M12.git . && \
    cd coffee-api
WORKDIR /usr/src/app/coffee-api
RUN npm install
EXPOSE 3002
CMD [ "node", "index.js" ]
