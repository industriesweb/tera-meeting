# Terra Meetings — Demo Deployment Runbook

## Overview

This runbook deploys a safe demo environment for Terra Meetings. It does **not** touch production.

- **Frontend**: Vercel
- **Backend + Socket.IO**: Render Web Service
- **Database**: Separate Neon demo database

## Prerequisites

- Vercel account (https://vercel.com)
- Render account (https://render.com)
- Neon account (https://neon.tech)
- GitHub access to the repository

---

## Step 1: Create Separate Neon Demo Database

1. Log in to [Neon Console](https://console.neon.tech).
2. Create a new project named `terra-meetings-demo`.
3. Copy the **pooled connection URL** (look for `DATABASE_URL` with `?sslmode=require`).
4. Copy the **direct connection URL** (look for `DIRECT_URL`).
5. **Do not** run `qa:reset` or `demo:seed` yet.

Save both URLs — you'll need them in Step 3.

## Step 2: Add Render Backend Service

1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New** → **Web Service**.
3. Connect your GitHub repository.
4. Configure:
   - **Name**: `terra-meetings-api`
   - **Runtime**: Node
   - **Region**: Oregon (or closest to your users)
   - **Branch**: `main` (or your deployment branch)
   - **Root Directory**: `backend`
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm run start`
   - **Health Check Path**: `/health`
   - **Plan**: Free
5. Click **Create Web Service** (do not deploy yet).

## Step 3: Set Backend Environment Variables

In the Render service dashboard → **Environment** tab, add:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | *(Neon pooled URL from Step 1)* |
| `DIRECT_URL` | *(Neon direct URL from Step 1)* |
| `SUPABASE_URL` | `https://atomthhkyqqqermlbxrd.supabase.co` |
| `SUPABASE_JWT_SECRET` | *(from your existing .env)* |
| `CORS_ORIGIN` | `https://your-vercel-app.vercel.app` *(placeholder — update after Step 7)* |
| `FRONTEND_URL` | `https://your-vercel-app.vercel.app` *(placeholder — update after Step 7)* |

**Do not expose secret values in logs or screenshots.**

## Step 4: Run Prisma Migration Deploy

After the first deploy, SSH into the Render shell or use Render's **Shell** tab:

```bash
npx prisma migrate deploy --schema=src/prisma/schema.prisma
```

This applies all migrations to the demo database.

## Step 5: Verify /health

```bash
curl https://terra-meetings-api.onrender.com/health
```

Expected response:
```json
{
  "ok": true,
  "service": "terra-meetings-api"
}
```

If this fails, check Render logs for database connectivity errors.

## Step 6: Add Vercel Frontend Project

1. Log in to [Vercel Dashboard](https://vercel.com).
2. Click **New Project** → **Import Git Repository**.
3. Select your repository.
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
5. Click **Deploy** (do not set env vars yet — first deploy to get the URL).

## Step 7: Set Frontend Environment Variables

After the first deploy, go to **Settings** → **Environment Variables** and add:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://atomthhkyqqqermlbxrd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(from your existing .env.local)* |
| `NEXT_PUBLIC_API_URL` | `https://terra-meetings-api.onrender.com` |
| `NEXT_PUBLIC_SOCKET_URL` | `https://terra-meetings-api.onrender.com` |

Redeploy the frontend after setting these.

## Step 8: Update Render CORS_ORIGIN with Final Vercel URL

1. Copy your Vercel deployment URL (e.g., `https://terra-meetings.vercel.app`).
2. In Render → **Environment**, update:
   - `CORS_ORIGIN` = your Vercel URL
   - `FRONTEND_URL` = your Vercel URL
3. Trigger a manual redeploy in Render.

## Step 9: Redeploy Backend

After updating CORS, redeploy the backend service in Render.

## Step 10: Run demo:seed

In Render → **Shell** tab, run:

```bash
npm run demo:seed
```

Expected output:
```
[demo:seed] Starting demo data seed...
[demo:seed] Demo data seeded successfully.
```

If you need to overwrite existing demo data:
```bash
npm run demo:seed -- --force
```

## Step 11: Smoke Test

Open your Vercel URL and test:

### Final Demo Smoke Checklist

- [ ] Login works (use existing Supabase Auth accounts)
- [ ] Dashboard loads
- [ ] Meeting List works
- [ ] Calendar works
- [ ] Create Quick Meeting works
- [ ] Live Meeting opens
- [ ] Socket connects only on Live Meeting route
- [ ] Dark mode changes colors
- [ ] No CORS errors
- [ ] No Render/Neon database errors

---

## Environment Variable Reference

### Backend (Render)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon pooled PostgreSQL URL |
| `DIRECT_URL` | No | Neon direct connection URL (for migrations) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_JWT_SECRET` | Yes | Supabase JWT signing secret |
| `PORT` | No | Server port (default: 4000, Render sets automatically) |
| `NODE_ENV` | No | `production` for live, `development` for local |
| `CORS_ORIGIN` | No | Frontend URL for CORS (default: `http://localhost:3000`) |
| `FRONTEND_URL` | No | Alias for CORS_ORIGIN |

### Frontend (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `NEXT_PUBLIC_API_URL` | Yes | Backend API URL (e.g., `https://api.example.com`) |
| `NEXT_PUBLIC_SOCKET_URL` | No | Backend Socket.IO URL (defaults to API URL) |

---

## Troubleshooting

### Backend won't start
- Check Render logs for `Missing required environment variable`
- Verify `DATABASE_URL` is set and the Neon database is active

### CORS errors
- Ensure `CORS_ORIGIN` in Render matches your exact Vercel URL (including `https://`)
- Redeploy backend after updating CORS_ORIGIN

### Database connection refused
- Neon databases pause after inactivity. Visit Neon Console to wake the database.
- Ensure `sslmode=require` is in the DATABASE_URL

### Login fails
- Verify `SUPABASE_URL` and `SUPABASE_JWT_SECRET` are correct
- Check that Supabase Auth users exist (use the Supabase Dashboard)

### Socket.IO doesn't connect
- Socket.IO only connects on the Live Meeting route
- Verify `NEXT_PUBLIC_SOCKET_URL` matches your Render service URL
