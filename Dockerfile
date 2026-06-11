FROM node:20-slim

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public
COPY docs ./docs
COPY agent-builder ./agent-builder
COPY mcp ./mcp
COPY README.md LICENSE ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
