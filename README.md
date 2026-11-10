# CarFish

CarFish is a real-time social deduction game inspired by [GameChanger](https://www.youtube.com/@GameChangerShow). Create or join a game, meet the other players, chat in the arena, and use the round-based voting system to identify the decoy.

## Play online

**[Open CarFish](https://car-fish.vercel.app/)**

## What you can do

- Create and join games with a short game code
- Set up a player profile with a display name, job, age, bio, and profile image
- Chat in public rooms, private player chats, and a dedicated game-master chat
- Play through game phases managed by the game master
- Vote during active rounds and review final results
- Get real-time updates across chats, game state, rounds, and votes

## Tech stack

- [Next.js](https://nextjs.org/) App Router
- [React](https://react.dev/) and TypeScript
- [Supabase](https://supabase.com/) Auth, PostgreSQL, Row Level Security, and Realtime
- [Tailwind CSS](https://tailwindcss.com/)
- [Vercel](https://vercel.com/) deployment

## Getting started

### Prerequisites

- Node.js 20 or newer
- A Supabase project
- Google OAuth credentials if Google sign-in is enabled

### Installation

```bash
git clone https://github.com/moienheydari/CarFish.git
cd CarFish
npm install
```

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Apply the migrations in [`supabase/migrations`](./supabase/migrations) using the Supabase CLI or the Supabase SQL editor. If you use Google sign-in, configure the provider and add your local callback URL (`http://localhost:3000/auth/callback`) to Supabase's redirect allow-list.

Start the development server:

```bash
npm run dev
```