# Backend Dockerfile - OdevPortali
FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --only=production

COPY . .

EXPOSE 5002

CMD ["node", "index.js"]
