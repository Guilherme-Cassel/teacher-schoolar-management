# School Management

A web app for a teacher to manage **grades**, **attendance**, **classroom
incidents/conduct** and **term closing** all in one place — replacing a bunch
of loose spreadsheets.

The key feature is the closing screen: when a student's grade falls just
short of the passing average, the system cross-references the grade with
their conduct history and **suggests** whether to round up or keep it. The
decision and justification are always the teacher's, and get permanently
recorded — the calculated average is never overwritten.

**Stack:** Next.js 15 (App Router) · TypeScript · Supabase (Postgres + Auth +
RLS) · Tailwind CSS · Vitest.

## Core rules

- **Average**: configurable per school or per subject — passing threshold,
  calculation method (arithmetic, weighted, sum of points), decimal places,
  makeup exams and minimum attendance. Assessments with different scales are
  normalized before entering the average.
- **Conduct**: each incident (praise/criticism) has a severity from 1 to 3;
  the term balance sums one and subtracts the other.
- **Closing suggestion**: cross-references how far a student is from passing
  with their conduct balance, and suggests rounding up, keeping the grade, or
  leaving the call open.
- **Audit trail**: adjusting a grade requires a justification — enforced as a
  `CHECK constraint` in the database, not just UI validation. A closed term
  blocks further entries via a trigger.
- **Security**: every table has RLS — each user only sees data for the school
  they're a member of. The model already supports multiple teachers sharing
  the same students and classes.

These rules live in three side-effect-free files, all covered by tests:
[`lib/domain/grading.ts`](lib/domain/grading.ts),
[`lib/domain/conduct.ts`](lib/domain/conduct.ts) and
[`lib/domain/closure-suggestion.ts`](lib/domain/closure-suggestion.ts).

## Project layout

```
app/(app)/          authenticated screens: dashboard, grades, attendance, closing…
app/login/          authentication
components/         shared UI
lib/domain/         business rules — pure functions, tested
lib/data/           screen data assembly from the database
lib/actions/        server actions (writes)
lib/supabase/       browser/server clients and session middleware
supabase/migrations versioned schema (+ supabase/migrations.sql, consolidated)
supabase/seed/      fictional sample data
```

## Running locally

The project is plug-and-play: there's no real data or credentials in the
code, only placeholders. All you need is your own (free) Supabase project.

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run [`supabase/migrations.sql`](supabase/migrations.sql)
   to create the full schema — and, if you want sample data, the files in
   [`supabase/seed/`](supabase/seed/), in numeric order.
3. Copy `.env.local.example` to `.env.local` and fill it in with your
   project's URL and `anon key` (**Project Settings → API**).
4. Install and run:

```bash
npm install
npm run dev
```

Full step-by-step guide (including Vercel deploy) in
[`docs/SETUP.md`](docs/SETUP.md) (in Portuguese).

## Commands

```bash
npm run dev        # development server
npm run build      # production build
npm test           # tests (vitest)
npm run typecheck  # type checking
```

## License

[MIT](LICENSE)
