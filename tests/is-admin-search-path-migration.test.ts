import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260922_add_search_path_to_is_admin.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('is_admin search_path migration', () => {
  it('replaces is_admin with a search_path-pinned copy of the same body', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain('create or replace function public.is_admin()')
    expect(normalizedSql).toContain('security definer set search_path = public')
    expect(normalizedSql).toContain(
      "select 1 from public.profiles where id = auth.uid() and role = 'admin'",
    )
  })
})
