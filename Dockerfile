FROM node:18-alpine

WORKDIR /app

COPY package.json package.json

ENV NODE_ENV production

RUN npm i

CMD ["npm", "run", "start"]
