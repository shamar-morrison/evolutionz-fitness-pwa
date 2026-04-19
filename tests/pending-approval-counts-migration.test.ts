import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260501_add_pending_approval_counts_rpc.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('pending approval counts migration', () => {
  it('defines the counts rpc and references all eight pending approval tables', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const normalizedSql = normalizeSql(sql)

    expect(normalizedSql).toContain('create or replace function public.get_pending_approval_counts()')
    expect(normalizedSql).toContain('from public.member_approval_requests')
    expect(normalizedSql).toContain('from public.member_edit_requests')
    expect(normalizedSql).toContain('from public.member_payment_requests')
    expect(normalizedSql).toContain('from public.member_extension_requests')
    expect(normalizedSql).toContain('from public.member_pause_requests')
    expect(normalizedSql).toContain('from public.member_pause_resume_requests')
    expect(normalizedSql).toContain('from public.pt_reschedule_requests')
    expect(normalizedSql).toContain('from public.pt_session_update_requests')
  })

  it('filters every count to pending status', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const pendingMatches = sql.match(/status = 'pending'/gu) ?? []

    expect(pendingMatches).toHaveLength(8)
  })
})
