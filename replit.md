# Phenomeny Review™

## Overview
AI-powered editorial platform built with Next.js 14 App Router. Features article management with scheduling, AI-powered editing tools (via Anthropic API), editorial categorization, and a branded purple/emerald design system.

## Tech Stack
- Next.js 14 with App Router (standalone output for deployment)
- TypeScript
- CSS Modules (no Tailwind)
- Supabase for data persistence
- Anthropic API (user's own key via ANTHROPIC_API_KEY, NOT Replit integration) for AI content generation

## Project Structure
```
src/
  app/
    layout.tsx                - Root layout
    page.tsx                  - Homepage (server component, fetches published articles)
    page.module.css           - Homepage styles
    admin/
      page.tsx                - Admin dashboard (article create, AI tools, article list)
      page.module.css         - Admin styles
      login/page.tsx          - Admin login
      edit/[id]/page.tsx      - Article editor
    companies/page.tsx        - Companies index (grid cards, ISR 300s)
    models/page.tsx           - Models index (grid cards, ISR 300s)
    timeline/[year]/page.tsx  - Timeline year view (events grouped by entity, ISR 300s)
    articles/[slug]/page.tsx  - Article detail page (SEO metadata)
    api/
      articles/route.ts       - Public articles API (GET published, POST new)
      articles/[id]/route.ts  - Article PATCH/DELETE (auth required)
      admin/articles/route.ts - Admin articles API (all statuses)
      ai-edit/route.ts        - AI editing endpoint (6 transformation actions)
      ingest/route.ts         - Intelligence ingestion (URL → article + timeline)
      subscribe/route.ts      - Newsletter subscription
      health/route.ts         - Health check
  lib/
    supabase.ts               - Supabase client
    anthropic.ts              - Anthropic API client (axios-based)
  components/
    article-feed.tsx          - Client component with category filtering
    subscribe-form.tsx        - Newsletter subscribe form
  styles/
    globals.css               - Global styles
dist/
  index.cjs                   - Production entry point (loads Next.js standalone server)
next.config.mjs               - Next.js config (standalone output enabled)
```

## Key Features
- **Article Management**: Create, edit, delete articles with slug generation
- **Status Workflow**: draft → published / scheduled (auto-promotes when publish_at passes)
- **AI Editing**: 6 actions (clarity, aggressive, analytical, summary, twitter, linkedin) via Anthropic Claude
- **Categories**: AI, AI Governance, AI Operations, Quantum, Space, Biotech, India–China, USA Europe, Intelligence Brief
- **Admin Auth**: Cookie-based (admin-auth cookie checked against ADMIN_SECRET env var)
- **Homepage**: Category filter pills, article cards grid, subscribe section
- **Intelligence Ingestion**: POST /api/ingest — URL fetch, HTML cleaning (cheerio), Anthropic structured extraction, dual insert into articles + timelines, source_url deduplication
- **SEO**: Open Graph, Twitter cards, canonical URLs on article pages

## Brand Colors
- Primary Purple: #1E0E6F
- Emerald Accent: #19C39C
- Background: #FAFAFA

## Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `ANTHROPIC_API_KEY` - Anthropic API key (server-side only)
- `ADMIN_SECRET` - Admin password for /admin/login
- `SESSION_SECRET` - Session secret

## Deployment
- `output: "standalone"` in next.config.mjs produces self-contained server
- `dist/index.cjs` copies static assets into standalone dir and boots the server
- Build: `npm run build` (runs `next build`)
- Run: `node dist/index.cjs` (loads .next/standalone/server.js)

## Database (Supabase)
Articles table columns: id (uuid), title, content, slug, status (draft/published/scheduled), publish_at (timestamptz), source_url, created_at
Timelines table columns: id (uuid), entity (text, NOT NULL), title, description, source_url, confidence (float), event_date (date), created_at
Note: category column used in code but does not exist in the database schema (silently ignored on insert)

## Running
```
npm run dev     # Development server on port 5000
npm run build   # Production build (standalone)
npm run start   # Production server on port 5000
```

## Recent Changes
- 2026-02-23: Initial project setup with Next.js 14 App Router
- 2026-02-23: Admin auth, AI editing, scheduled publishing, categories
- 2026-02-23: Homepage redesign with purple/emerald brand, category filtering
- 2026-02-23: Deployment fix — standalone output + dist/index.cjs entry point
- 2026-02-24: Intelligence ingestion system — POST /api/ingest endpoint with URL fetch, HTML cleaning (cheerio), Anthropic structured extraction, dual insert (articles + timelines), source_url deduplication, admin UI integration
