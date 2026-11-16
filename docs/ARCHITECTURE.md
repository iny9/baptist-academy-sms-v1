# Architecture

## Overview

```
Browser --(anon key + user session, Row Level Security)--> Supabase (Postgres, Auth, Storage)
Browser --(session cookie)--> Next.js routes --(service role, after a role check)--> Supabase, Resend, Termii
Browser --(Bearer token)--> Express API (optional) --(service role, after a role check)--> Supabase, Resend
```

Most reads and writes go straight from the browser to Supabase, and the database decides what each person may do. Work that needs more power than a user has (creating accounts, sending bulk email or SMS, storing photos, building PDFs) runs on the server after the caller's role has been checked.

## Roles

| Role | Scope | Main abilities |
|---|---|---|
| Admin | Whole school | Everything: users, website content, sessions and terms, locks, audit log, archive |
| Exam officer | One section | Classes, subjects, students, teacher assignments, results, report card downloads |
| Principal | Secondary | Dashboard and records for the Secondary section; sets level 2 fees |
| Headmaster / headmistress | Basic | Dashboard and records for the Basic section; sets level 2 fees |
| Bursar | Whole school | Sets level 1 fees, confirms payments, outstanding fees list |
| Board member | Whole school, read only | Dashboard and messages to parents |
| Class teacher | One or more classes | Students of the class, attendance register, level 3 fees, CA forms for the class |
| Subject teacher | Assigned class and subject | Score entry and the CA form |
| Parent / guardian | Linked children | Their children's results, attendance, payment schedule |

A person can hold several roles. When someone is a parent and also staff, the app acts as the parent by default and lets them switch.

Sections: Basic (Nursery and Primary) and Secondary (Junior and Senior). Teachers belong to one section.

## Main tables

`profiles`, `user_roles`, `invites`, `site_settings`, `board_members`, `past_leaders`, `academic_years`, `terms`, `classes`, `subjects`, `class_subject_teachers`, `class_teachers`, `students`, `guardians`, `school_days`, `attendance`, `rating_traits`, `ratings`, `scores`, the fee tables (`fee_items`, `student_fee_lines` and related), `newsletters`, and the audit and archive tables.

Rules that the database itself enforces:

- Scores are 0 to 15, 0 to 15 and 0 to 70. Ratings are 1 to 5. Days present cannot exceed days open.
- A teacher and a subject must match the section of the class.
- Scores keep the class they were entered for, so results stay correct after roll-over.
- Entries are refused for inactive or locked terms and for students excluded from a term.
- Score sheets are saved through one function that rejects the whole sheet if any student is missing a mark.
- Pictures are stored as files. Tables hold only a link.

## Results

`term_results()` works out totals, grades, averages, positions and class size. It ranks the whole class and then returns only the rows the caller may see, so a parent sees the correct position but only their own child's row. In third term the cumulative average is the mean of the student's active terms, compared with the session target to give Promoted, Repeat or Graduated. Grade letters are A 70 and above, B 60 to 69, C 50 to 59, D 40 to 49 and F below 40; confirm these with the school.

## Fees

Fee items come in three levels: bursar (level 1), principal or headmaster for a section (level 2), and class teacher for a class (level 3). Issuing a schedule copies the items a student owes into fee lines, so later edits to an item do not change lines already issued. A line moves from pending to claimed when a parent marks it paid, then to confirmed when the bursar approves it, or back to pending with a note if rejected. Only the database functions change those lines; nobody edits amounts directly.

## Accounts and sign-in

Administrators sign in with an email address. Everyone else gets a username. Supabase Auth needs an email-shaped identifier, so a username becomes an internal alias of the form `username@<NEXT_PUBLIC_LOGIN_DOMAIN>`. Nothing is sent to that address. A real email can be stored separately and is used only to send a password-reset link.

## Storage

Buckets: `site-media`, `avatars`, `student-photos` (public) and `tellers` (private). Old attendance, ratings and audit rows can be moved into archive tables from the Archive page. Scores and fee records are kept.

## Documents

Report cards, payment schedules, newsletters and the CA form share one visual style, on screen and in the PDFs built by `lib/pdf.js`. The PDF route is limited to administrators and the relevant exam officers. PDF text is limited to Latin characters, and the naira sign is written as NGN in the PDFs.

## Known simplifications

- Transferred and deceased are the student's current status, not a per-term status.
- Student photos are stored as uploaded after being resized in the browser; there is no background removal.
- The Express API covers only invitations and parent messages.
