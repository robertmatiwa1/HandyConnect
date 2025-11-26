FROM node:20-slim

WORKDIR /app

# Install required OS libs for Prisma
RUN apt-get update && apt-get install -y openssl

COPY package.json package-lock.json* ./

RUN npm install --legacy-peer-deps

COPY . .

# Generate Prisma client with correct binary
RUN npx prisma generate

# Build NestJS
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/main.js"]
