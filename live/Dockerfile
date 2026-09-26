# Node 24 runs TypeScript directly (type stripping); multi-arch incl. linux/arm64.
FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production PORT=8081
USER node
EXPOSE 8081
HEALTHCHECK --interval=60s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1:8081/live/health || exit 1
CMD ["node", "--experimental-strip-types", "--no-warnings", "src/server.ts"]
