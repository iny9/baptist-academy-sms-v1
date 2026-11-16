# Baptist Academy School Management System

A web app for running the day-to-day records of Baptist Academy, Yola: students, classes, scores, attendance, report cards, school fees and the messages that go out to parents. It is built with Next.js and Supabase.

I built it around how the school actually works, so a few things are specific to us: two sections (Basic and Secondary), a bursar who sets fees in three levels, class teachers who hold the attendance register, and parents who should only ever see their own children.

## What it does

- **Public website.** Landing page with the school's history, current board members, past principals, a hero carousel and an editable footer. The admin edits all of it from the dashboard.
- **People and roles.** Admin, exam officer, principal, headmaster/headmistress, bursar, board member, class teacher (form master in the Secondary section), subject teacher and parent. One person can hold several roles. People sign in with a username, except administrators, who use an email address.
- **Academics.** Sessions with three terms, classes, subjects per sub-section, teacher assignments, student records with passport photos, and CSV import for bulk onboarding.
- **Scores and results.** First CA and second CA (0 to 15 each) and exam (0 to 70). Score sheets are all-or-nothing: if any student in the class is missing a mark, nothing is saved. Grades, class positions, third-term cumulative averages and Promoted/Repeat against the session target.
- **Attendance and conduct.** An attendance register kept by the class teacher, an attendance calendar, and ratings for affective and psychomotor traits.
- **Report cards.** On screen, printable, or downloaded as server-generated PDFs for one student or a whole class. Basic and Secondary have different designs. The school stamp and signatures print on every card.
- **Fees.** The bursar sets level 1 items, the principal or headmaster sets level 2 for their section, and class teachers set level 3 for their class. Parents mark what they have paid, the bursar confirms, and the parent is told what is still outstanding. There is a list of outstanding fees by class, section, session or term.
- **Dashboards.** Top-level, class-level and student-level analytics for the admin, board members and section heads.
- **Messaging.** Email through Resend and SMS through Termii, with newsletters and bulk messages to parents filtered by class or section.
- **Housekeeping.** An audit log, locking of terms or sessions, promotion and roll-over at the end of a session, and archiving of old attendance and audit records.

## Tech stack

| Part | Choice |
|---|---|
| Front end and server routes | Next.js 14 (App Router), React 18 |
| Database, auth and file storage | Supabase (Postgres with Row Level Security) |
| PDFs | pdf-lib |
| Email | Resend |
| SMS | Termii |
| Hosting | Vercel or Netlify |

Access rules live in the database as Row Level Security policies, not only in the screens, so a page that is hidden in the interface is also refused at the data layer.

## Getting started

You need Node 18.18 or newer and a free Supabase project.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up the database. In the Supabase SQL editor run `supabase/schema.sql`, then each file in `supabase/migrations` in numeric order, then `supabase/verify.sql`. The verify script should return no rows. More detail is in [supabase/README.md](supabase/README.md).

3. Create your environment file and fill it in:

   ```bash
   cp .env.example .env.local
   ```

   The URL and anon key are under Project Settings > API in Supabase. The service-role key is on the same page. Keep it on the server only.

4. In Supabase, go to Authentication > URL Configuration. Set the Site URL to `http://localhost:3000` and add `http://localhost:3000/**` to the redirect URLs.

5. Create the first administrator. In Authentication > Users, add yourself with Auto Confirm ticked, then run this in the SQL editor with your own email:

   ```sql
   insert into user_roles (user_id, role)
   select id, 'admin' from profiles where email = 'you@example.com';
   ```

6. Start the app and sign in at `/login`:

   ```bash
   npm run dev
   ```

From there, the Users and roles page is where you create everyone else.

## Project layout

```
app/            pages and API routes (Next.js App Router)
components/     React components, with dashboard charts in components/dash
lib/            shared logic: grading, rankings, validation, PDF building, mail, SMS
supabase/       schema.sql, numbered migrations, verify.sql
tests/          offline checks for the grading, dashboard, attendance and fee logic
express-api/    optional Express version of the privileged endpoints
docs/           architecture and deployment notes
public/         logo and hero images
```

## Tests

```bash
npm test
```

These are plain Node scripts that check the grading rules, dashboard maths, attendance logic, schedule logic and role access without needing a database. They do not replace testing the real thing: before real student data goes in, sign in as each role and try to open another section's records.

## Deploying

Vercel and Netlify both work. The steps, including the environment variables to add, are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Please read [SECURITY.md](SECURITY.md) before going live. A few Supabase settings matter a lot, especially turning off public sign-ups.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit together, the roles, and the main rules in the database
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): putting the code on GitHub and deploying it
- [SECURITY.md](SECURITY.md): what is protected, what you must configure, and known limits
- [supabase/README.md](supabase/README.md): database setup and migrations
- [express-api/README.md](express-api/README.md): the optional Express API

## Notes on the data

This system holds information about children, including photos, so treat it accordingly. Collect only what you need, keep the service-role key out of anything public, and check what the Nigeria Data Protection Act 2023 requires of the school.
