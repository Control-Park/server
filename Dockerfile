FROM node:20.16-slim
WORKDIR /app
COPY . /app/
RUN npm install
