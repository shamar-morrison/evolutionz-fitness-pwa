import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260514_guard_unassign_member_card_status.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('unassign member card status guard migration', () => {
  it('redefines unassign_member_card with the assigned-status guard on the card update', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'create or replace function public.unassign_member_card( p_member_id uuid, p_employee_no text, p_card_no text, p_decommission boolean default false )',
    )
    expect(normalizedSql).toContain(
      "where card_no = p_card_no and employee_no = p_employee_no and status = 'assigned';",
    )
    expect(normalizedSql).toContain("when coalesce(p_decommission, false) then 'decommissioned'")
    expect(normalizedSql).toContain("set status = 'suspended', card_no = null")
  })
})
