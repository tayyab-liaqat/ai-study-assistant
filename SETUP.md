# Study Assistant Setup Guide (Windows + PowerShell)

This guide helps you run the full project after cloning from GitHub.

## Project Structure

- `backend-nest` -> NestJS backend API
- `frontend` -> Next.js frontend app
- `tables` -> PostgreSQL schema SQL files
- `scripts/bootstrap-db.ps1` -> one-command DB schema import

## 1) Prerequisites

Install:

- Node.js 20+
- PostgreSQL 14+
- npm (comes with Node.js)

Check versions:

```powershell
node -v
npm -v
psql --version
```

## 2) Clone and Install Dependencies

```powershell
git clone <YOUR_REPO_URL>
cd "study-assistant"

cd "backend-nest"
npm install

cd "..\frontend"
npm install
```

## 3) Create PostgreSQL Database

Use pgAdmin or `psql` and create a database:

```sql
CREATE DATABASE "my app";
```

If you prefer `myapp` (without space), that is also fine. Keep the same value in backend config.

## 4) Backend Environment Configuration

Create `backend-nest/.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=YOUR_REAL_POSTGRES_PASSWORD
DB_NAME=my app
DATABASE_URL=postgres://postgres:YOUR_REAL_POSTGRES_PASSWORD@localhost:5432/my%20app
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_OPTIONAL
```

Notes:

- If DB name has a space (`my app`), encode it in `DATABASE_URL` as `my%20app`.
- `GEMINI_API_KEY` is optional for startup, but needed for AI features.

## 5) Import Database Tables (One Command)

From project root:

```powershell
.\scripts\bootstrap-db.ps1 -DbName "my app" -DbUser "postgres"
```

If PostgreSQL is not on PATH, provide psql path:

```powershell
.\scripts\bootstrap-db.ps1 -DbName "my app" -DbUser "postgres" -PsqlPath "C:\Program Files\PostgreSQL\17\bin\psql.exe"
```

You can also pass host/port:

```powershell
.\scripts\bootstrap-db.ps1 -DbName "my app" -DbUser "postgres" -DbHost "localhost" -DbPort 5432
```

## 6) Start Backend

```powershell
cd "backend-nest"
npm run start:dev
```

Expected:

- Backend starts on `http://localhost:5000`
- Basic check:

```powershell
Invoke-WebRequest -Uri "http://localhost:5000" -UseBasicParsing
```

## 7) Start Frontend

Open another terminal:

```powershell
cd "study-assistant\frontend"
npm run dev
```

Expected:

- Frontend starts on `http://localhost:3000`

## 8) Smoke Test

- Open `http://localhost:3000`
- Try signup/login
- Upload a document
- Call backend route:

```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/documents" -UseBasicParsing
```

## 9) Troubleshooting

### `password authentication failed for user "postgres"`

- Wrong `DB_PASSWORD`
- `DATABASE_URL` and `DB_*` values mismatch
- PostgreSQL user password changed

Fix by updating `backend-nest/.env` and restarting backend.

### `database does not exist`

- DB name mismatch (`my app` vs `myapp`)

### `next is not recognized`

- Run `npm install` inside `frontend`

### Port already in use

- Backend should use `5000`
- Frontend should use `3000`
- Stop old processes and rerun

## 10) Production Build (Optional)

Backend:

```powershell
cd backend-nest
npm run build
npm run start:prod
```

Frontend:

```powershell
cd frontend
npm run build
npm run start
```
