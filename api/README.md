# ByteChat API

    npm install
    cp .env.example .env        # fill DATABASE_URL and secrets
    npx prisma migrate dev --name init
    npm run dev

Auth flow: POST /api/v1/auth/request-otp -> POST /api/v1/auth/verify-otp -> use accessToken as `Authorization: Bearer ...`
In development the OTP is printed in the server console.
