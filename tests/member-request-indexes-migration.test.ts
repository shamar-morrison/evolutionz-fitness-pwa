import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260503_add_member_edit_and_payment_request_indexes.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('member request indexes migration', () => {
  it('adds the expected member edit and member payment request indexes', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'create index member_edit_requests_status_created_at_idx on public.member_edit_requests (status, created_at desc);',
    )
    expect(normalizedSql).toContain(
      'create index member_edit_requests_member_id_created_at_idx on public.member_edit_requests (member_id, created_at desc);',
    )
    expect(normalizedSql).toContain(
      'create index member_edit_requests_requested_by_idx on public.member_edit_requests (requested_by);',
    )
    expect(normalizedSql).toContain(
      'create index member_payment_requests_status_created_at_idx on public.member_payment_requests (status, created_at desc);',
    )
    expect(normalizedSql).toContain(
      'create index member_payment_requests_member_id_created_at_idx on public.member_payment_requests (member_id, created_at desc);',
    )
    expect(normalizedSql).toContain(
      'create index member_payment_requests_requested_by_idx on public.member_payment_requests (requested_by);',
    )
  })
})
