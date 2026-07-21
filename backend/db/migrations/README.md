# Database Migrations

This directory contains SQL migration files for setting up the AlgoSplit database schema in Supabase.

## Quick Start

### Option 1: Run in Supabase SQL Editor (Recommended for setup)

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Navigate to **SQL Editor** in the left sidebar
3. Run each migration file in order:
   - `001_create_base_tables.sql`
   - `002_create_workout_tables.sql`
   - `003_create_exercise_overrides.sql`
   - `004_setup_rls_policies.sql`
   - `005_create_triggers.sql`
   - Continue through `015_backend_audit_advisor_followup.sql`. For a clean database,
     prefer the ordered bootstrap file in `backend/db/bootstrap`.

4. After running all migrations, verify the tables were created:
   ```sql
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name;
   ```

### Option 2: Run via Supabase CLI

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Link your project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

3. Run migrations:
   ```bash
   supabase db push
   ```

## Migration Files

| File | Description |
|------|-------------|
| `001_create_base_tables.sql` | Creates splits, sessions, and exercises tables |
| `002_create_workout_tables.sql` | Creates workout_logs and workout_exercises tables |
| `003_create_exercise_overrides.sql` | Creates exercise_overrides table |
| `004_setup_rls_policies.sql` | Sets up Row Level Security policies for all tables |
| `005_create_triggers.sql` | Creates triggers for automatic timestamp updates |
| `012_performance_rpcs.sql` | Adds atomic split-session saves and compact workout overview/progress RPCs |
| `013_extend_split_cycle_to_14_days.sql` | Extends persisted split cycles to 14 days |
| `014_backend_audit_repair.sql` | Adds missing meso schema, replay protection, and aggregate write RPCs |
| `015_backend_audit_advisor_followup.sql` | Adds the recovery-use FK index and explicit backend-only policy |

## Schema Overview

```
auth.users (managed by Supabase)
  ├─1:M→ splits
  ├─1:M→ workout_logs
  └─1:M→ exercise_overrides

splits
  ├─1:M→ sessions
  └─1:M→ workout_logs (optional FK)

sessions
  ├─1:M→ exercises
  └─1:M→ workout_logs (optional FK)

workout_logs
  └─1:M→ workout_exercises
```

## Verifying the Setup

After running all migrations, you can verify everything is set up correctly:

```sql
-- Check all tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
    'splits',
    'sessions',
    'exercises',
    'workout_logs',
    'workout_exercises',
    'exercise_overrides'
)
ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
    'splits',
    'sessions',
    'exercises',
    'workout_logs',
    'workout_exercises',
    'exercise_overrides'
);

-- Check policies exist
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check triggers exist
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
```

## Rolling Back

To roll back the migrations (WARNING: This will delete all data):

```sql
-- Drop all triggers
DROP TRIGGER IF EXISTS update_splits_updated_at ON public.splits;
DROP TRIGGER IF EXISTS update_sessions_updated_at ON public.sessions;
DROP TRIGGER IF EXISTS update_exercise_overrides_updated_at ON public.exercise_overrides;

-- Drop the trigger function
DROP FUNCTION IF EXISTS public.update_updated_at_column();

-- Drop all tables (in reverse dependency order)
DROP TABLE IF EXISTS public.workout_exercises CASCADE;
DROP TABLE IF EXISTS public.workout_logs CASCADE;
DROP TABLE IF EXISTS public.exercise_overrides CASCADE;
DROP TABLE IF EXISTS public.exercises CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.splits CASCADE;
```

## Troubleshooting

### Error: "relation already exists"
- This means the table was already created. You can skip this migration or drop the table first.

### Error: "permission denied for schema public"
- Make sure you're running the migrations as the database owner or with sufficient privileges.
- Check that you're using the correct Supabase service role key.

### RLS policies preventing access
- Make sure `auth.uid()` returns a valid user ID.
- You can temporarily disable RLS for testing (NOT in production):
  ```sql
  ALTER TABLE public.splits DISABLE ROW LEVEL SECURITY;
  ```

### Need to reset everything
- Use the rollback script above to start fresh.

## Next Steps

After running migrations:

1. Update your `.env` file with Supabase credentials
2. Test the database connection in your FastAPI app
3. Create your first split via the API
4. Verify data is being stored correctly in Supabase dashboard

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
# Migration ordering

The duplicate `001`, `002`, and `008` prefixes are historical and may already
have been applied manually in production. Do not rename them. New changes are
strictly additive. For an empty database, use
`backend/db/bootstrap/000_splitai_baseline.sql`, which records the authoritative
dependency order and stops on the first error.
