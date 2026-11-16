# Express API

An optional Node and Express service for the operations that need the Supabase service-role key. The Next.js app already does these in its own `app/api` routes, so you only need this if you want the privileged key to live in a separate service.

It currently covers two things:

- `POST /api/invite`: invite administrators by email (admin only)
- `POST /api/message`: send messages to parents (admin and board members)

There is also `GET /api/health`.

Every request needs an `Authorization: Bearer <Supabase access token>` header. The server checks the token, then reads the caller's roles from `user_roles`. It uses Helmet, a CORS allow-list taken from `FRONTEND_URL`, zod validation and rate limits.

It does not yet cover username accounts, PDFs, photo uploads or the finance routes. Those stay in the Next.js app.

## Run it locally

```bash
cp .env.example .env     # fill in your own values
npm install
npm run dev              # http://localhost:4000
curl localhost:4000/api/health
```

Use the same Supabase project as the web app, with the database already set up (see `../supabase/README.md`).

## Deploy

Deploy this folder as its own project, separate from the web app.

- **Vercel:** import the folder and set the environment variables. `vercel.json` sends `/api/*` to `api/index.js`.
- **Netlify:** import the folder and set the environment variables. `netlify.toml` sends `/api/*` to the function in `netlify/functions`.

## Pointing the web app at it

Replace the web app's calls to its own `/api/invite` and `/api/send` with calls to this service, passing the user's access token in the `Authorization` header. Once nothing in the web app needs the service-role key, remove it from the web app's environment.
