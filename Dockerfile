FROM node:8

RUN mkdir -p /opt/app
WORKDIR /opt/app

COPY package.json /opt/app
RUN npm install --production

COPY . /opt/app

ENV MEDIA_PATH=/media

ENTRYPOINT ["node", "index.js"]
