# Security

This file explains how the system is protected, what you need to configure yourself, and where the known gaps are. It comes from reading the code, the database policies and the API routes by hand. It is not a penetration test, so have the system tested properly before real student data goes in.

## Reporting a problem

If you find a security issue, please don't open a public issue. Contact the repository owner directly and give them time to fix it first.

## Secrets

- The only secret keys are `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` and `TERMII_API_KEY`. None of them is in this repository, and `.gitignore` excludes every `.env*` file except `.env.example`.
- The service-role key bypasses Row Level Security. It is read only in server code (`lib/supabase-server.js`, the API routes and the Express API), always after the caller's role has been checked. It must never start with `NEXT_PUBLIC_`.
- Set real values in your hosting dashboard, not in files. If a key is ever committed, pasted into a chat or shown in a screenshot, treat it as leaked: rotate it in Supabase straight away, then redeploy.
- The anon key and project URL are public by design. They are safe because every table is protected by Row Level Security.

## How access is enforced

- **In the database.** Row Level Security is on for every table. Sensitive operations such as saving scores, issuing fee schedules, confirming payments and moving students up a class go through database functions that check who is calling. The functions set a fixed `search_path` and are revoked from the anonymous role.
- **In the middleware.** Every `/admin` page requires a verified Supabase session. The identity headers the app reads are stripped from incoming requests, so a caller cannot forge them.
- **In the API routes.** Each route checks the caller's role, validates its input with zod or the helpers in `lib/validate.js`, and applies a per-user rate limit. Cross-site writes are refused by an Origin check.
- **Roles.** A parent sees only their own children. Staff see only their own section or class. Board members open the dashboard only. Role changes clean up anything that depended on the old role, and the last administrator cannot be removed.
- **Terms and scores.** Entries for inactive or locked terms are refused by database triggers, so no screen or API can get around the lock.
- **Audit log.** Inserts, updates and deletes on the main tables are recorded with who did it and when. The log is append-only and readable by administrators only.

## Other protections

- Security headers on every response: Content-Security-Policy, HSTS, `X-Frame-Options: DENY`, `nosniff`, a strict Referrer-Policy and Permissions-Policy.
- Redirects after sign-in accept only plain same-site paths.
- "Forgot password" gives the same answer whether or not the account exists.
- User text is escaped before it goes into emails, and CSV exports neutralise spreadsheet formulas.
- Uploads are checked on the server by file signature (JPEG, PNG or WebP), capped at 3 MB, and limited again by the storage bucket settings.
- The PDF route only fetches images from this site or the project's own storage, which closes off server-side request forgery.
- Errors returned to the browser are plain sentences. Raw database and driver messages are logged on the server instead of being sent to users.
- New passwords must be 8 to 72 characters, contain a letter and a number, and differ from the username. People created with an administrator-set password are forced to change it at first sign-in.

## What you must set up in Supabase before launch

1. **Turn off public sign-ups** (Authentication > Providers > Email > "Allow new users to sign up"). Accounts are created by an administrator. Leaving sign-ups open lets strangers create accounts.
2. Raise the minimum password length to 10 or more and turn on leaked-password protection if your plan has it.
3. Set the Site URL and redirect URLs to your real domain only.
4. Turn on backups, or export the database on a schedule.
5. Hand out usernames and temporary passwords privately, and shred printed credential lists.

## Known limits

- The Content-Security-Policy allows inline scripts, which Next.js needs by default. A nonce-based policy would be stricter.
- The rate limiter is in memory, so it resets whenever a serverless instance restarts. Use a shared store such as Upstash Redis if you need hard limits.
- **Student photos, profile pictures and website images are in public storage buckets.** Their paths are long and unguessable, but anyone who has a link can open the image. For children's photos, consider making `student-photos` private and serving signed URLs.
- Parents can print their own child's report card from the browser, because they are allowed to view it. The official PDF download is limited to the administrator and exam officers.
- The audit log grows quickly. Archive old rows rather than deleting them.
- The project has no automated end-to-end tests of the database rules. For each role, sign in and try to read or change another section's data, and confirm it is refused.

## Data protection

The system stores personal data about children and their parents. Keep to what the school needs, limit who can see photos, publish a privacy notice, and check the school's obligations under the Nigeria Data Protection Act 2023.
