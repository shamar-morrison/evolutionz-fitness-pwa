import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260513_add_decommissioned_card_status.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('decommissioned card status migration', () => {
  it('widens the cards status constraint to include decommissioned', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain('drop constraint if exists cards_status_check')
    expect(normalizedSql).toContain(
      "check (status in ('available', 'assigned', 'suspended_lost', 'disabled', 'decommissioned'))",
    )
  })

  it('replaces unassign_member_card with a decommission-aware function', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'drop function if exists public.unassign_member_card(uuid, text, text);',
    )
    expect(normalizedSql).toContain(
      'create or replace function public.unassign_member_card( p_member_id uuid, p_employee_no text, p_card_no text, p_decommission boolean default false )',
    )
    expect(normalizedSql).toContain("when coalesce(p_decommission, false) then 'decommissioned'")
    expect(normalizedSql).toContain("else 'available'")
    expect(normalizedSql).toContain("set status = 'suspended', card_no = null")
  })
})
