# Intentionally outdated base image: demo for the image scan gate. Never merge.
FROM node:16-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:16-alpine
# npm is only needed to install packages in the builder stage; removing it drops its vulnerable dependencies
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY app.js ./
EXPOSE 8080
USER node
CMD ["node", "app.js"]
