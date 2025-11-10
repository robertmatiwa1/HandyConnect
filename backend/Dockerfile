FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm install --legacy-peer-deps || yarn install || pnpm install
COPY . .
RUN npm run prisma:gen
RUN npm run build || echo "Skipping build for starter"
CMD ["npm", "run", "start:dev"]
