# E-commerce Growth Intelligence — Next.js Web App (`web/`)

Production-ready **Next.js 16 (App Router) + TypeScript + PostgreSQL 16** migration of the 5-page Streamlit product analytics dashboard, configured for **Vercel** deployment with Root Directory set to `web`.

- **Dashboard Modules (`components/views/`):** Executive Overview, Strict Session Funnel, Retention & Cohorts, Channel & Product Economics, Data Quality & Live `EXPLAIN ANALYZE` Benchmarks.
- **Database Layer (`lib/server/db.ts`):** Pooled `pg.Pool` with `@vercel/functions` (`attachDatabasePool`) and parameterised queries (`lib/server/sql.ts`).
- **Statistics (`lib/analytics.ts`):** TypeScript port of `src/analytics.py` (Two-Proportion Z-test, Chi-Square, Welch t-test, Mann-Whitney U, A/B sample size planner).

## Quickstart
```bash
cd web
npm install
npm test
npm run db:reset   # uses DATABASE_URL (Neon/Supabase) or root .env (Docker Postgres on 5433)
npm run dev
```

## Vercel Configuration
1. Import the GitHub repository in Vercel and set **Root Directory** to `web`.
2. Connect a PostgreSQL database (e.g. **Neon** via Vercel Marketplace) to provide `DATABASE_URL`.
3. Seed the hosted database once with `DATABASE_URL="..." npm run db:reset` inside `web/`.
