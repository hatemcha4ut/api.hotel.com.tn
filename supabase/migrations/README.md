# Supabase Migrations

This directory contains versioned SQL migrations for the hotel.com.tn database schema.

## Baseline Process

To audit the current production schema and establish a baseline:

1. Go to **Actions** → **Audit Supabase Schema** workflow
2. Click **Run workflow** and select the environment (prod/staging)
3. Download the generated artifact: `supabase-schema-{environment}-{date}.sql`
4. Compare this schema dump with existing migrations to identify any manual changes

This workflow helps identify schema drift - differences between what's defined in migrations versus what exists in the database.

## Creating New Migrations

When you need to add/modify database schema:

1. **Identify Changes**: Use the schema audit workflow to understand current state
2. **Create Migration File**: Follow the naming convention below
3. **Write Idempotent SQL**: Use `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, etc.
4. **Test Locally**: Apply the migration to ensure it works correctly
5. **Commit**: Add the migration file to version control

### Naming Convention

Migration files must follow this format:

```
YYYYMMDDHHMMSS_description.sql
```

Examples:
- `20260208120000_add_sessions_settings_audit.sql`
- `20260203013000_enable_rls_policies.sql`

The timestamp ensures migrations are applied in chronological order.

### Idempotency

**All migrations MUST be idempotent** - they should be safe to run multiple times without errors or unintended side effects.

Always use:
- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `INSERT ... ON CONFLICT DO NOTHING`
- `CREATE POLICY IF NOT EXISTS` (PostgreSQL 15+) or check existence first

### Testing Migrations

Never test directly on production! Test migrations in order:

1. **Local Development**: Use Supabase local development
2. **Staging**: Apply to staging environment first
3. **Production**: Only after thorough testing

## Applying Migrations

To apply migrations to a Supabase project:

```bash
# Apply all pending migrations
supabase db push

# Or apply to specific environment
supabase db push --db-url "postgresql://..."
```

The Supabase CLI tracks which migrations have been applied using the `supabase_migrations.schema_migrations` table.

## Security Reminder

⚠️ **NEVER commit secrets, passwords, or connection strings to migration files**

- Don't hardcode API keys
- Don't include actual connection strings
- Don't commit sensitive data
- Use environment variables and secrets management for credentials

## Migration Structure

Each migration should:
1. Be focused on a single logical change
2. Include comments explaining the purpose
3. Add appropriate indexes for performance
4. Configure Row Level Security (RLS) policies for new tables
5. Document any special considerations

Example structure:
```sql
-- Description of what this migration does

-- Create tables
CREATE TABLE IF NOT EXISTS public.example (...);

-- Add indexes
CREATE INDEX IF NOT EXISTS example_idx ON public.example (...);

-- Enable RLS
ALTER TABLE public.example ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "example_policy" ON public.example ...;

-- Add comments for documentation
COMMENT ON TABLE public.example IS '...';
```

## Rollback Strategy

Migrations are forward-only. If you need to undo changes:

1. Create a new migration that reverses the changes
2. Never modify existing migrations after they've been applied
3. Consider using DOWN migrations for complex rollbacks (not currently implemented)

## References

- [Supabase Migrations Documentation](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [PostgreSQL CREATE TABLE IF NOT EXISTS](https://www.postgresql.org/docs/current/sql-createtable.html)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
