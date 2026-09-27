import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260921_admin_assistant_expanded_access.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('administrative assistant expanded access migration', () => {
  it('adds a title-scoped helper limited to administrative assistants', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'create or replace function public.is_administrative_assistant()',
    )
    expect(normalizedSql).toContain("'administrative assistant' = any(titles)")
    expect(normalizedSql).not.toContain("'assistant' = any(titles)")
    expect(normalizedSql).toContain('security definer set search_path = public')
  })

  it('adds additive policies without touching the admin-only policies', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'create policy "administrative assistants full access to admin_email_deliveries"',
    )
    expect(normalizedSql).toContain(
      'create policy "administrative assistants can read membership_expiry_email_sends"',
    )
    expect(normalizedSql).toContain(
      'create policy "administrative assistants full access to door_history_cache"',
    )
    expect(normalizedSql).toContain(
      'create policy "administrative assistants can insert trainer_clients"',
    )
    expect(normalizedSql).toContain(
      'create policy "administrative assistants can update trainer_clients"',
    )
    expect(normalizedSql).toContain(
      'create policy "administrative assistants can delete trainer_clients"',
    )
    expect(normalizedSql).toContain(
      'create policy "administrative assistants can insert pt_sessions"',
    )
    expect(normalizedSql).toContain(
      'create policy "administrative assistants can update pt_sessions"',
    )
    expect(normalizedSql).toContain(
      'create policy "administrative assistants can insert training_plan_days"',
    )
    expect(normalizedSql).toContain(
      'create policy "administrative assistants can read all profiles"',
    )
    expect(normalizedSql).toContain('on public.profiles for select to authenticated')
    expect(normalizedSql).toContain('using (public.is_administrative_assistant())')
    // Existing admin policies stay intact: no drops of admin policies here.
    expect(normalizedSql).not.toContain('drop policy if exists "admins can')
    expect(normalizedSql).not.toContain('drop policy if exists "admin full access')
    expect(normalizedSql).not.toContain('create policy "admins can')
    expect(normalizedSql).not.toContain('create policy "admin full access')
  })

  it('includes explicit revoke and grant statements', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'revoke all on table public.admin_email_deliveries from public, anon;',
    )
    expect(normalizedSql).toContain(
      'revoke all on table public.door_history_cache from public, anon;',
    )
    expect(normalizedSql).toContain(
      'revoke all on table public.trainer_clients from public, anon;',
    )
    expect(normalizedSql).toContain(
      'revoke all on table public.profiles from public, anon;',
    )
    expect(normalizedSql).toContain(
      'grant select on table public.profiles to authenticated;',
    )
    expect(normalizedSql).toContain(
      'grant select, insert, update, delete on table public.admin_email_deliveries to authenticated;',
    )
    expect(normalizedSql).toContain(
      'grant select on table public.membership_expiry_email_sends to authenticated;',
    )
    expect(normalizedSql).toContain(
      'grant execute on function public.is_administrative_assistant() to authenticated, service_role;',
    )
  })
})
