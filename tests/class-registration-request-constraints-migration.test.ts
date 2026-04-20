import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260507_add_class_registration_request_constraints.sql',
)

describe('class registration request constraints migration', () => {
  it('backfills null proposed fee types and makes the column non-null', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain("set proposed_fee_type = 'custom'")
    expect(sql).toContain('alter column proposed_fee_type set not null')
  })

  it('adds the removal request amount check and pending unique index', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('class_registration_removal_requests_amount_paid_at_request_check')
    expect(sql).toContain('check (amount_paid_at_request >= 0)')
    expect(sql).toContain('class_registration_removal_requests_pending_registration_id_unique_idx')
    expect(sql).toContain("where status = 'pending'")
  })
})
