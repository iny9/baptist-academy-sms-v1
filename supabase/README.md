# Database setup

Everything here runs in the Supabase SQL editor.

## New project

1. Run `schema.sql`. It creates the tables, functions, Row Level Security policies, storage buckets and triggers.
2. Run the files in `migrations/` one at a time, in numeric order (`001` to `011`). Each one is safe to run more than once.
3. Run `verify.sql`. It lists anything the app expects that the database does not have, so an empty result is what you want.

## What each migration does

| File | Purpose |
|---|---|
| `001_student_photos_storage.sql` | Creates the `student-photos` storage bucket and its read policy |
| `002_dashboard_overview.sql` | Top-level dashboard queries |
| `003_dashboard_class_level.sql` | Class-level dashboard queries |
| `004_dashboard_student_level.sql` | Student-level dashboard queries |
| `005_grading_merit.sql` | Grade letters and merit score |
| `006_attendance_register.sql` | Attendance register |
| `007_fee_schedules.sql` | Payment schedules, clearing, carry-forward, bursar queue, parent inbox |
| `008_speed_and_images.sql` | Removes redundant indexes and checks that pictures are stored as links, not inside tables |
| `009_access_ranking_defaults.sql` | Access scoping and one ranking rule everywhere |
| `010_board_dashboard_only.sql` | Board members open the dashboard only |
| `011_multi_class_ca_visibility.sql` | A teacher can lead more than one class; class teachers see CA forms for their own students |

## Storage buckets

| Bucket | Public | Holds |
|---|---|---|
| `site-media` | yes | Website images and the carousel |
| `avatars` | yes | Profile pictures |
| `student-photos` | yes | Student passport photos |
| `tellers` | no | Payment teller images |

Tables keep only a link or path to a file. Nothing binary goes in a column.

## Upgrading an existing database

Run any migration whose number is higher than the last one you applied, in order, then run `verify.sql` again. Take a backup first.

## Before going live

Turn off public sign-ups in Authentication > Providers > Email. The full checklist is in [../SECURITY.md](../SECURITY.md).
