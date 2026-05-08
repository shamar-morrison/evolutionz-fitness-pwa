import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260517_lock_member_row_in_approve_member_payment_request.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('approve member payment request member lock migration', () => {
  it('locks the member row before evaluating cardless transition guards', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'select * into v_member from public.members where id = v_request.member_id for update;',
    )
  })
})
