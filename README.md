# E-commerce Growth Intelligence: Funnel, Retention & Revenue Analytics

A production-grade, SQL-first Product Analytics & Analytics Engineering web platform simulating growth, conversion funnel friction, cohort retention, and revenue leakage analytics for a large Indian e-commerce platform.

Deployed on **Vercel** via **Next.js 16 (App Router)** + **PostgreSQL 16** (Neon / Supabase), with the full analytical Python toolkit and Streamlit dashboard preserved.

---

## Live Dashboard Overview

![Executive Dashboard Overview](docs/screenshots/01_executive_dashboard_overview.png)

![Segment Friction & DAU Stickiness Trends](docs/screenshots/02_segment_friction_and_dau_trends.png)

---

## 1. Why the Vercel Migration Was Needed

### Root Cause of `PYTHON_ENTRYPOINT_NOT_FOUND`
When deploying the original repository directly to Vercel, the build failed with:
```text
PYTHON_ENTRYPOINT_NOT_FOUND
```
Vercel detected a Python runtime from the root `requirements.txt`, but Streamlit (`streamlit run app/streamlit_app.py`) runs as a persistent server process with WebSockets, which is incompatible with Vercel's serverless and fluid compute execution model.

### Target Architecture
To solve this without sacrificing analytical rigor or fabricating data:
- **Frontend & App Shell:** Next.js 16 with TypeScript, React 19, Tailwind CSS v4, shadcn/ui, and Recharts.
- **Backend & Data Access:** Parameterised, pooled PostgreSQL 16 connections via `pg.Pool` with `@vercel/functions` lifecycle attachment (`attachDatabasePool`).
- **Analytics & Business Logic:** 100% of existing SQL queries (`sql/*.sql`), synthetic data generation (`sql/seed_data.sql`, fixed seed = 42), and statistical models (Two-Proportion Z-Test, Chi-Square, Welch t-test, A/B power sizing) are preserved and execute natively.
- **Zero Frontend Credential Exposure:** Raw database credentials and connection strings are strictly isolated on the server.
- **Python Toolkit Preserved:** The original Streamlit dashboard, automated pytest suite, and Python pipeline remain available under `python/`.

---

## 2. Architecture & Repository Structure

```text
ecommerce-growth-intelligence/
├── app/                                          # Next.js 16 App Router (Vercel-native)
│   ├── api/
│   │   ├── analytics/
│   │   │   ├── executive/route.ts                # Page 1: KPIs, Revenue Bridge, Trends, Categories
│   │   │   ├── funnel/route.ts                   # Page 2: Strict Funnel, Friction, Worst Segments, Z-Test
│   │   │   ├── retention/route.ts                # Page 3: D1–D30 Retention, Heatmap, DAU Stickiness, LTV
│   │   │   ├── economics/route.ts                # Page 4: Unit Economics, Profitability, Leakage
│   │   │   └── data-quality/route.ts             # Page 5: 10-Point Audit, Volumes, EXPLAIN Benchmarks
│   │   ├── filters/route.ts                      # Dynamic filter bounds & dimension options
│   │   └── health/route.ts                       # Database latency & connection status
│   ├── globals.css                               # Tailwind CSS v4 styling
│   ├── layout.tsx                                # Root layout with typography and metadata
│   └── page.tsx                                  # Interactive analytics dashboard shell
├── components/
│   ├── dashboard-shell.tsx                       # Master layout manager & suspense boundary
│   ├── filters/
│   │   └── filter-bar.tsx                        # Global filters bar (Date, Device, Channel, City, Category)
│   ├── layout/
│   │   ├── header.tsx                            # Header with real-time PostgreSQL latency monitor
│   │   └── sidebar.tsx                           # 5-module analytical navigation
│   ├── ui/                                       # shadcn/ui component library
│   └── views/
│       ├── executive-view.tsx                    # Module 1: Executive Overview & Revenue Intelligence
│       ├── funnel-view.tsx                       # Module 2: Strict Funnel & Friction Analysis
│       ├── retention-view.tsx                    # Module 3: Retention & Cohort Analysis
│       ├── economics-view.tsx                    # Module 4: Channel & Product Economics
│       └── data-quality-view.tsx                 # Module 5: Data Quality & SQL Benchmarks
├── hooks/
│   └── use-filters.ts                            # URL query-string synchronised filter state
├── lib/
│   ├── analytics.ts                              # Two-Proportion Z-Test, Chi-Square, A/B Sample Size Sizer
│   ├── filters.ts                                # Whitelist validation, URL parser, cache key generator
│   ├── utils.ts                                  # Currency (INR) and number formatting helpers
│   └── server/
│       ├── db.ts                                 # pg.Pool connection manager + attachDatabasePool
│       ├── sql.ts                                # Parameterised query builders (prevents SQL injection)
│       └── queries/                              # Server-only analytical SQL query executors
├── scripts/
│   └── migrate.ts                                # TypeScript database migration & seed runner
├── sql/
│   ├── 00_schema.sql                             # DDL with constraints (Users, Products, Sessions, Events, etc.)
│   ├── seed_data.sql                             # Deterministic seed script (50k users, 110k sessions, 295k+ events)
│   ├── 01_executive_kpis_and_reconciliation.sql  # Multi-table joins, FILTER aggregates, GMV-to-Net waterfall
│   ├── 02_strict_session_funnel.sql              # Chronological session funnel (t1 < t2 < t3 < t4)
│   ├── 03_funnel_segmentation_matrix.sql         # Device, City Tier, Channel, Category conversion gaps
│   ├── 04_user_engagement_dau_wau_mau.sql        # DAU, WAU, MAU, stickiness ratios, 7D rolling avg
│   ├── 05_cohort_retention_d1_d7_d30.sql         # Exact D1/D7/D14/D30 cohort retention (right-censoring guarded)
│   ├── 06_repeat_purchase_and_ltv_windows.sql    # ROW_NUMBER, LAG, LEAD inter-purchase intervals & LTV
│   ├── 07_channel_and_category_economics.sql     # Channel ARPU, AOV, Repeat Rate, Refund Rate
│   ├── 08_revenue_leakage_diagnostics.sql        # Coupon cannibalization, COD cancellations, refund drivers
│   ├── 09_data_quality_and_reconciliation.sql    # 10 automated assertions: duplicates, nulls, orphans, math
│   ├── 10_indexes_and_explain_analyze.sql        # Composite & covering indexes + ANALYZE
│   └── 11_explain_analyze_benchmarks.sql         # Standalone EXPLAIN (ANALYZE, BUFFERS) benchmarks
├── tests/
│   ├── analytics.test.ts                         # Vitest tests verifying statistical engine against SciPy
│   ├── filters.test.ts                           # Vitest tests for URL filter parsing & whitelist validation
│   └── sql.test.ts                               # Vitest tests for parameterisation & index-friendly queries
├── python/                                       # Preserved original Python toolkit & Streamlit dashboard
│   ├── app/streamlit_app.py                      # Original Streamlit analytical dashboard
│   ├── src/                                      # Python database helpers, seed runners & pipeline
│   ├── tests/                                    # Original 12 pytest integration tests
│   ├── requirements.txt                          # Locked Python dependencies
│   └── pytest.ini                                # Pytest runner configuration
├── docker-compose.yml                            # Reproducible local PostgreSQL 16 container (Port 5433)
└── vercel.json                                   # Vercel deployment configuration
```

---

## 3. The Five Analytical Dashboard Modules

### Page 1: Executive Overview & Revenue Intelligence
- **Executive KPI Suite:** Active Users, Total Sessions, Total Orders, Session CVR %, Gross GMV, Net Realized Revenue, Net AOV, and ARPU/ARPPU.
- **Financial Reconciliation Accounting Identity:**
  $$\text{Booked Net} = \text{Cancelled} + \text{Processed Refunds} + \text{Net Realized Revenue}$$
  With automated zero-gap validation.
- **Revenue Leakage Bridge Waterfall:** Step-by-step breakdown from Gross Catalog GMV through Promotional Discounts, GST & Shipping, Cancellations, and Returns to Realized Revenue.
- **Weekly & Monthly Revenue Trends:** Dual-axis visualization with completed orders and period-over-period growth %.
- **Product Category Contribution:** Revenue share and AOV across 6 Indian e-commerce verticals.

### Page 2: Funnel & Friction Analysis
- **Strictly Ordered Session Funnel:** Enforces chronological milestone order:
  $$t_{\text{view}} < t_{\text{cart}} < t_{\text{checkout}} < t_{\text{purchase}}$$
  Contrasted against naive event aggregation (revealing 1,548 out-of-order/unattributed cart events).
- **Segment Friction Matrix:** Cart-to-Checkout conversion rates by Device Build and City Tier.
- **Statistical Hypothesis Testing:** Live Two-Proportion Z-Test between Android `v4.1-legacy` vs `v4.8-stable` ($Z = -6.26$, $p < 10^{-8}$, confirming checkout latency defect).
- **Worst-Converting Segments Matrix:** Full paginated matrix ranking low-performing intersections (sessions $\ge 200$) with conversion rate gaps against the platform baseline.

### Page 3: Retention & Cohort Intelligence
- **Exact Cohort Milestones:** Day 1 (D1), Day 7 (D7), Day 14 (D14), and Day 30 (D30) cohort retention segmented by acquisition channel.
- **Weekly Signup Cohort Heatmap:** Color-graded matrix tracking retention decay across weekly signup cohorts.
- **DAU, WAU, MAU & Stickiness:** Daily Active Users with 7-day rolling moving average and $\text{DAU}/\text{MAU}$ stickiness ratio.
- **Repeat Purchase Behavior & Customer LTV:** Window-function analysis of inter-purchase days and realized LTV by first-purchase product category.
- **Buyer Concentration Segmentation:** Power buyers (4+ orders) vs Repeat buyers (2-3 orders) vs One-time buyers.

### Page 4: Channel & Product Economics
- **Channel Quality Matrix:** Scatter bubble chart plotting Repeat Purchase Rate % vs. Net ARPU (bubble size = GMV).
- **Unit Economics Breakdown Table:** User conversion rate, repeat rate, total orders, GMV, Net Revenue, AOV, ARPU, discount %, and refund %.
- **Product Category Profitability:** Synthesized using line items and catalog costs (`products.cost_inr`) to compute real COGS, gross profit INR, and gross margin %.
- **Payment Method Risk Profile:** Doorstep refusal rates for Cash-on-Delivery (COD) vs UPI and credit cards.
- **Revenue Leakage Diagnostics Table:** Server-side paginated decomposition across category, payment mode, and coupon codes.

### Page 5: Data Quality Audit & SQL Benchmarks
- **Automated 10-Point Data Quality Checklist:** Executing `sql/09_data_quality_and_reconciliation.sql` across Uniqueness, Completeness, Referential Integrity, Temporal Logic, Revenue Math, and Domain Validity with zero violations.
- **Table Scale Verification:** Validating that all tables exceed project minimums (Users $\ge 50\text{k}$, Sessions $\ge 100\text{k}$, Events $\ge 150\text{k}$, Orders $\ge 25\text{k}$, Products $\ge 10\text{k}$).
- **Live PostgreSQL EXPLAIN (ANALYZE, BUFFERS):** Live query execution plan inspector demonstrating index coverage and buffer hit efficiency.
- **Interactive A/B Test Power & Sample Size Calculator:** Sample size sizing based on baseline conversion rate, relative MDE %, and statistical power.

---

## 4. Quickstart & Local Setup

### Prerequisites
- **Node.js 20+** (Node.js 24 recommended)
- **Docker Desktop** (for local PostgreSQL 16 on port `5433`) OR a **Hosted PostgreSQL instance** (Neon / Supabase).

### Step-by-Step Instructions

```powershell
# 1. Navigate to the repository
cd C:\Users\jainy\.gemini\antigravity\scratch\ecommerce-growth-intelligence

# 2. Copy environment file
Copy-Item .env.example .env -Force

# 3. Start local PostgreSQL 16 container (Port 5433)
docker compose up -d

# 4. Install Node.js dependencies
npm install

# 5. Populate relational schema, seed synthetic dataset (SEED=42), and build indexes
npm run db:reset

# 6. Verify table row volumes and integrity
npm run db:verify

# 7. Run Vitest automated test suite (13 passing tests)
npm test

# 8. Start local Next.js development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the application.

---

## 5. Deploying to Vercel

### Step 1: Push Repository to GitHub
```powershell
git add .
git commit -m "Migrate E-commerce Growth Intelligence to Next.js on Vercel"
git push origin main
```

### Step 2: Provision Hosted PostgreSQL
Create a free serverless PostgreSQL database on **Neon** (via Vercel Marketplace) or **Supabase**.
Copy your connection string (`DATABASE_URL`).

### Step 3: Seed Hosted Database
Run the migration script once pointing to your hosted database:
```powershell
$env:DATABASE_URL="postgresql://neondb_owner:YOUR_PASSWORD@ep-sample.us-east-1.aws.neon.tech/neondb?sslmode=require"
npm run db:reset
```

### Step 4: Import into Vercel
1. Go to [vercel.com/new](https://vercel.com/new) and select the `ecommerce-growth-intelligence` repository.
2. Under **Environment Variables**, add:
   - `DATABASE_URL`: Your hosted PostgreSQL connection string.
3. Click **Deploy**.

Vercel will automatically build the Next.js application, optimize routes, and deploy the application.

---

## 6. Running the Preserved Python & Streamlit Suite Locally

The original Python workflow remains available under `python/`:

```powershell
# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r python/requirements.txt

# Run Python data pipeline
python -m python.src.run_pipeline

# Run Python pytest suite (12 tests)
pytest python/tests/ -v

# Launch original Streamlit dashboard
streamlit run python/app/streamlit_app.py
```
