# Putting it on GitHub and deploying

## Before the first commit

1. Check that no real keys are in the folder. Open `.env.example` and confirm it holds only placeholders.
2. Run `git status` after `git init` and make sure no `.env.local` shows up. The `.gitignore` already excludes it.
3. Run `npm install` once. It creates `package-lock.json`. Commit that file so builds are repeatable.

## Create the repository

1. On GitHub, create a new repository. Leave "Add a README" and "Add .gitignore" unticked, because the project already has both.
2. In the project folder:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/baptist-academy-sms.git
   git push -u origin main
   ```

3. If the repository will be public, read [../SECURITY.md](../SECURITY.md) first. The code is safe to publish because it holds no secrets, but your Supabase project and hosting settings must stay private.

If you ever commit a secret by mistake, deleting the file in a later commit is not enough, because it stays in the history. Rotate the key in Supabase first, then clean the history or start a fresh repository.

## Deploy on Vercel

1. Import the GitHub repository. The framework is detected as Next.js.
2. Add the environment variables from `.env.example` under Settings > Environment Variables. Mark the service-role key as sensitive.
3. Deploy, then set `NEXT_PUBLIC_SITE_URL` to the live address and redeploy.

## Deploy on Netlify

1. Import the repository. `netlify.toml` already uses the Next.js plugin and Node 20.
2. Add the same environment variables under Site configuration > Environment variables.
3. Deploy, then set `NEXT_PUBLIC_SITE_URL` to the live address and redeploy.

## After the first deploy

1. In Supabase, set the Site URL to your live address and add `https://your-domain/**` to the redirect URLs.
2. Turn off public sign-ups and apply the other settings in [../SECURITY.md](../SECURITY.md).
3. Sign in as the administrator and send yourself a test email.
4. Create one account for each role and check that each can see only what it should.

## The Express API

If you use `express-api/`, deploy it as a separate project. See [../express-api/README.md](../express-api/README.md).
