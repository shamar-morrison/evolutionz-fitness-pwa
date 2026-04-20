import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260506_add_class_registration_request_notifications_and_counts.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('class registration notification migration', () => {
  it('adds both class registration request types to the notifications constraint', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const normalizedSql = normalizeSql(sql)

    expect(normalizedSql).toContain("'class_registration_edit_request'")
    expect(normalizedSql).toContain("'class_registration_removal_request'")
    expect(normalizedSql).toContain('add constraint notifications_type_check')
  })

  it('extends get_pending_approval_counts with both class registration request queues', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const normalizedSql = normalizeSql(sql)
    const pendingMatches = sql.match(/status = 'pending'/gu) ?? []

    expect(normalizedSql).toContain('create function public.get_pending_approval_counts()')
    expect(normalizedSql).toContain('class_registration_edit_requests integer')
    expect(normalizedSql).toContain('class_registration_removal_requests integer')
    expect(sql).toMatch(/from public\.class_registration_edit_requests\b/u)
    expect(sql).toMatch(/from public\.class_registration_removal_requests\b/u)
    expect(pendingMatches).toHaveLength(10)
  })
})
