# HandyConnect Backend

Minimal NestJS + Prisma starter for the HandyConnect MVP.

## Getting Started

1. Start the databases:

   ```bash
   docker compose up -d
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure environment:

   ```bash
   cp .env.example .env
   ```

4. Generate the Prisma client and apply migrations:

   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

5. Run the development server:

   ```bash
   npm run start:dev
   ```

6. Open Swagger docs at [http://localhost:3000/api](http://localhost:3000/api).
