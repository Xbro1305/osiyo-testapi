# Textile Backend (v2 — JWT + bcrypt)

Production backend for the OSIYO HOME textile production tracker.

## Stack

- Node 18+ / Express
- MongoDB (Atlas in production, local for dev)
- JWT for stateless auth
- bcryptjs for password hashing

## Setup

```bash
# 1. Install
npm install

# 2. Copy env template and fill in values
cp .env.example .env
#    - Set MONGODB_URI (Atlas or local)
#    - Set JWT_SECRET (long random string)
#    - Optional: CORS_ORIGINS (comma-separated frontend URLs)

# 3. Seed the database (creates default admin + lists)
npm run seed

# 4. If you have an existing DB with PLAINTEXT passcodes from the v1 backend,
#    hash them in place with:
npm run migrate-passwords

# 5. Start
npm start
# or in dev with auto-reload
npm run dev
```

## Routes

All routes (except `POST /api/auth/login` and `GET /api/health`) require:
```
Authorization: Bearer <token>
```

### Auth
- `POST /api/auth/login` — body `{ login, passcode }` → `{ token, user }`
- `GET  /api/auth/me` — returns current user from token (used to re-hydrate on page reload)

### CRUD endpoints
- `GET/POST/DELETE /api/users[/:id]` — write requires admin
- `GET/POST       /api/lists` — singleton dropdown lists
- `GET/POST/DELETE /api/designs[/:id]`
- `GET/POST/DELETE /api/machines[/:id]`
- `GET/POST/DELETE /api/programs[/:id]`
- `GET/POST/DELETE /api/customers[/:id]`
- `GET/POST/DELETE /api/store/sales[/:id]`
- `GET/POST/DELETE /api/store/payments[/:id]`
- `GET/POST/DELETE /api/store/stockin[/:id]`
- `GET/POST       /api/config/:key` — singleton config (e.g. 'numbering', 'prefs')
- `GET/POST/DELETE /api/trash[/:id]`
- `GET/POST/DELETE /api/records/:stationKey[/:id]` — generic per-station records

### Valid stationKeys
`gray_store`, `gray_out`, `input`, `bleach`, `dyeing`, `batching`, `printing`, `curing`, `finishing`, `calendering`, `folding`, `dispatch_in`, `dispatch_out`, `maintenance`, `breakdown`, `dailycheck`

## Deploy notes

- **Rotate any password that has been shared in chat or commits.**
- Generate a strong `JWT_SECRET`:
  ```
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
- For a hosted deployment (Render, Railway, Fly, etc.) point `MONGODB_URI` at MongoDB Atlas.
- Set `CORS_ORIGINS=https://your-frontend.com` for production.
- Default admin login is `admin` / `admin`. CHANGE IT immediately after first login.
