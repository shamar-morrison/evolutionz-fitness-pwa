import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260502_restrict_dashboard_and_pending_counts_rpc_execute.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('rpc execute privileges migration', () => {
  it('restricts dashboard and pending approval count rpcs to the service role', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'revoke all on function public.get_dashboard_stats(timestamptz, text) from public, anon, authenticated;',
    )
    expect(normalizedSql).toContain(
      'grant execute on function public.get_dashboard_stats(timestamptz, text) to service_role;',
    )
    expect(normalizedSql).toContain(
      'revoke all on function public.get_pending_approval_counts() from public, anon, authenticated;',
    )
    expect(normalizedSql).toContain(
      'grant execute on function public.get_pending_approval_counts() to service_role;',
    )
  })
})
