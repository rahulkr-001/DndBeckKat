# Dandiya Night Katoria — Backend Deployment Guide

This guide details instructions for deploying `dandiya-night-backend` to production platforms (Render, Railway, AWS ECS, DigitalOcean App Platform, or custom VPS).

---

## Prerequisites

1. **Managed PostgreSQL Database**:
   - PostgreSQL 15+ instance with connection pooling (e.g. Supabase, Neon, AWS RDS, Render Postgres).
   - Ensure SSL is enabled (`sslmode=require` in production).

2. **Official Razorpay Account**:
   - `RAZORPAY_KEY_ID` (Live Key)
   - `RAZORPAY_KEY_SECRET` (Live Secret)
   - Configured Webhook URL pointing to `https://dnd-kat-gdcm.vercel.app/api/payments/webhook/RAZORPAY`

3. **Cloudinary Account**:
   - Cloud Name, API Key, and API Secret.

4. **Resend Account**:
   - Validated sending domain (or default onboarding domain) and API Key.

---

## Deploying on Render / Railway

### 1. Build & Start Commands
- **Build Command**:
  ```bash
  npm install && npx prisma migrate deploy && npm run build
  ```
- **Start Command**:
  ```bash
  npm run start
  ```
- **Port**: Configure `PORT` environment variable (Render sets this automatically; default `5000`).

### 2. Environment Variables Checklist
Ensure all following variables are set in your deployment dashboard:

```env
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/dandiya_db?schema=public
NEXT_PUBLIC_APP_URL=https://your-frontend-domain.com
CORS_ORIGIN=https://your-frontend-domain.com
JWT_SECRET=your_production_64_character_hex_secret
TICKET_SECURITY_SALT=your_production_ticket_security_salt
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
CLOUDINARY_CLOUD_NAME=xxxxxxxx
CLOUDINARY_API_KEY=xxxxxxxx
CLOUDINARY_API_SECRET=xxxxxxxx
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=passes@yourdomain.com
```

---

## Docker Deployment

To containerize the backend for Kubernetes or AWS ECS:

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

# Dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci

# Builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Runner
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=5000
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

EXPOSE 5000
CMD ["npm", "run", "start"]
```

---

## Health Checks & Monitoring

- **Status Health Check**: `GET /` returns HTTP 200 with JSON / HTML status.
- **Event Health Check**: `GET /api/public/event` returns HTTP 200 with active published festival details.
