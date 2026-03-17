FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# Generate Prisma client
COPY prisma ./prisma/
RUN npx prisma generate

# Build TypeScript
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src/
RUN npx tsc -p tsconfig.build.json

# Production stage
FROM node:22-alpine
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/package.json ./

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/src/index.js"]
