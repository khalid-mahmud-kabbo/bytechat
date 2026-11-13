# ByteChat

    bytechat/
      api/   Express + Prisma + Socket.IO   (code in api/app, not src)
      web/   Next.js App Router + Tailwind   (code in web/app, not src)
      docker-compose.yml   Postgres + Redis for local dev

## Run

    npm run db:up                      # Postgres + Redis (needs Docker)
    npm run install:all
    cp api/.env.example api/.env       # set DATABASE_URL / secrets
    cp web/.env.example web/.env.local
    npm run migrate                    # creates tables
    npm run dev:api                    # http://localhost:4000
    npm run dev:web                    # http://localhost:3000

Login with a phone like +8801700000000. In development the OTP is printed in the API console.

## Status
- Done: API auth (OTP + JWT + refresh rotation), Prisma schema, Socket.IO base, web UI shell (login, sidebar, chat list, chat window, contact info, dark mode)
- Web chat screens use mock data (web/lib/mock-data.ts) until step 2 connects the chat API + socket events.
