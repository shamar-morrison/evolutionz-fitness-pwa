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
    const requestTables = [
      'member_approval_requests',
      'member_edit_requests',
      'member_payment_requests',
      'member_extension_requests',
      'member_pause_requests',
      'member_pause_resume_requests',
      'pt_reschedule_requests',
      'pt_session_update_requests',
    ]

    expect(normalizedSql).toContain('create or replace function public.get_pending_approval_counts()')

    for (const table of requestTables) {
      expect(sql).toMatch(new RegExp(String.raw`from public\.${table}\b`, 'u'))
    }
  })

  it('filters every count to pending status', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const pendingMatches = sql.match(/status = 'pending'/gu) ?? []

    expect(pendingMatches).toHaveLength(8)
  })
})
