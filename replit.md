# Phenomeny Review™

## Overview
AI-powered editorial platform built with Next.js 14 App Router.

## Tech Stack
- Next.js 14 with App Router
- TypeScript
- CSS Modules (no Tailwind)
- Supabase (client library prepared)
- Anthropic API (client library prepared via axios)

## Project Structure
```
src/
  app/
    layout.tsx        - Root layout
    page.tsx          - Home page
    api/
      health/
        route.ts      - Health check endpoint
  lib/
    supabase.ts       - Supabase client (uses env vars)
    anthropic.ts      - Anthropic API client (uses env var)
  components/         - Reusable components
  styles/
    globals.css       - Global styles
```

## Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `ANTHROPIC_API_KEY` - Anthropic API key (server-side only)

## Running
```
npm run dev     # Development server on port 5000
npm run build   # Production build
npm run start   # Production server on port 5000
```

## Recent Changes
- 2026-02-23: Initial project setup with Next.js 14 App Router foundation
