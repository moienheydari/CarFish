Website : https://car-fish.vercel.app/

For Development : https://supabase.com/dashboard/project/xnzwlzgpkrvfvmkqpqhk/auth/url-configuration


# ChatArena

ChatArena is a Next.js App Router MVP for real-time game chats. It uses Supabase Auth, PostgreSQL, RLS, and Realtime. Chats are public or private, belong to a four-character game code, and can be open or locked.

## Local setup

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Run `supabase/migrations/20261030190000_initial.sql` in the Supabase SQL editor (or with the Supabase CLI).
4. Enable Google under Supabase **Authentication > Providers > Google**. Create a Google OAuth web client and add the Supabase callback URL shown by the provider settings. Add `http://localhost:3000/auth/callback` and the production callback URL to the Supabase URL configuration.
5. Install and run:

```bash
npm install
npm run dev
```

## Architecture

- Server Components load protected pages and use the cookie-backed Supabase SSR client.
- `proxy.ts` refreshes auth cookies on requests. Route handlers under `src/app/api` authenticate and validate every mutation.
- PostgreSQL constraints and RLS enforce ownership, membership, message length, and host-only state transitions.
- `ChatClient` subscribes only to the active chat's `messages` and `chats` Postgres Changes channels. Message history starts at 50 rows and can be extended with cursor pagination.

## Deployment

Deploy the repository to Vercel, add the three environment variables from `.env.example`, and set the Supabase URL configuration `SITE_URL`/redirect allow-list to the Vercel domain. Do not add a service-role key to Vercel for this MVP.

## Verification

Run `npm run lint`, `npx tsc --noEmit`, and `npm run build`. Cloud authentication, RLS, and cross-browser Realtime behavior require configured Supabase credentials and should be manually verified with two accounts.

## Known limitations

The MVP has no scoring, voting, rounds, uploads, or exact online presence. Private chats are limited to two members by a database trigger.
