import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260501_add_dashboard_stats_rpc.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('dashboard stats migration', () => {
  it('defines the get_dashboard_stats rpc with the expected signature and output keys', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const normalizedSql = normalizeSql(sql)

    expect(normalizedSql).toContain('create or replace function public.get_dashboard_stats(')
    expect(normalizedSql).toContain('p_now timestamptz')
    expect(normalizedSql).toContain('p_timezone_offset text')
    expect(normalizedSql).toContain('returns jsonb')
    expect(sql).toContain("'activeMembers'")
    expect(sql).toContain("'activeMembersLastMonth'")
    expect(sql).toContain("'totalExpiredMembers'")
    expect(sql).toContain("'expiringSoon'")
    expect(sql).toContain("'signedUpThisMonth'")
    expect(sql).toContain("'signupsByMonth'")
    expect(sql).toContain("'expiredThisMonth'")
    expect(sql).toContain("'expiredThisMonthLastMonth'")
  })

  it('uses an explicit month series to zero-fill the trailing six signup buckets', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain('generate_series(0, 5)')
    expect(normalizedSql).toContain('jsonb_agg')
    expect(normalizedSql).toContain("to_char(months.month_start, 'yyyy-mm')")
  })
})
