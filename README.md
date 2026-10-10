# Dandiya Night Katoria — Backend Service Engine

High-performance, secure backend API service and digital admission engine for the Dandiya Night Katoria event platform.

## Architecture Overview

- **Framework**: Next.js 16 (API Route Handlers) on Node.js
- **Database & ORM**: PostgreSQL with Prisma ORM
- **Payment Gateway**: Official Razorpay Checkout & Webhook Integration
- **Media Asset Management**: Cloudinary official SDK with automated image optimization & local fallback
- **Authentication**: Scrypt password hashing with cryptographic salt & secure HTTP-only cookie sessions
- **Ticketing & QR Engine**: HMAC-SHA256 cryptographically signed tokens with atomic entry invalidation
- **Pricing & Tax Engine**: Server-authoritative integer minor unit (paise) calculation with dynamic CMS-configurable GST and platform convenience fees

---

## Directory Structure

```
dandiya-night-backend/
├── prisma/
│   ├── schema.prisma         # Authoritative database schema
│   └── migrations/           # Complete versioned migration history
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── admin/        # RBAC-guarded admin CMS & audit routes
│   │   │   ├── auth/         # Scrypt login, register, OTP & session APIs
│   │   │   ├── checkout/     # Server calculation & atomic inventory reservation
│   │   │   ├── payments/     # Razorpay order creation, verification & webhooks
│   │   │   ├── public/       # Public event & venue data
│   │   │   └── tickets/      # PDF pass rendering & turnstile QR validation
│   │   ├── layout.tsx        # Base layout
│   │   └── page.tsx          # System health check endpoint
│   ├── lib/
│   │   ├── auth/             # Session & RBAC verification
│   │   ├── inventory/        # Concurrency-safe atomic reservation
│   │   ├── payments/         # Razorpay provider & auto-refund resilience
│   │   ├── pricing/          # Dynamic GST & platform fee pricing engine
│   │   ├── tickets/          # Cryptographic ticket issuance
│   │   ├── cloudinary.ts     # Media upload integration
│   │   └── prisma.ts         # Singleton database client
│   └── middleware.ts         # CORS & security headers
├── tests/                    # Production test suites (44 automated test assertions)
├── package.json
├── tsconfig.json
├── next.config.ts
├── .env.example
├── README.md
└── DEPLOYMENT.md
```

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your database and provider credentials:
```bash
cp .env.example .env
```

### 3. Apply Database Migrations
```bash
npm run db:migrate
```

### 4. Run Development Server
```bash
npm run dev
```
The backend API server will start on `http://localhost:5000`.

### 5. Run Automated Verification Tests
```bash
npm test
```

---

## Core API Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/public/event` | Published event, tiers, and venue photos | None |
| `POST` | `/api/checkout/calculate` | Authoritative pricing & coupon computation | None |
| `POST` | `/api/checkout/reserve` | Atomic inventory reservation | None |
| `POST` | `/api/payments/create-order` | Create official Razorpay payment order | None |
| `POST` | `/api/payments/verify` | Cryptographic signature validation & ticket generation | None |
| `POST` | `/api/payments/webhook/[gateway]` | Idempotent webhook event processor | Webhook Secret |
| `POST` | `/api/tickets/validate` | Gatekeeper turnstile QR scanner validation | Validator / Admin |
| `GET` | `/api/admin/payment-config` | View active GST & platform fee configuration | Super Admin / Finance Admin |
| `PUT` | `/api/admin/payment-config` | Update GST & platform fee settings | Super Admin |
| `GET` | `/api/admin/venue-photos` | List all venue gallery photos | Admin |
| `POST` | `/api/admin/venue-photos` | Add venue photo with title & caption | Admin |
| `PUT` | `/api/admin/venue-photos` | Reorder or feature venue cover photo | Admin |
| `DELETE` | `/api/admin/venue-photos` | Delete venue photo | Admin |
