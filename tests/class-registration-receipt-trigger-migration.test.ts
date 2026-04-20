import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260508_fix_class_registration_receipt_assignment_trigger.sql',
)

describe('class registration receipt trigger migration', () => {
  it('assigns receipt numbers only after payment has been recorded', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('new.payment_recorded_at is null')
    expect(sql).toContain('coalesce(new.amount_paid, 0) <= 0')
    expect(sql).toContain("nextval('public.member_payment_receipt_number_seq')")
  })

  it('replaces the trigger with an insert-or-update trigger and guards repeat updates', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain("if tg_op = 'UPDATE'")
    expect(sql).toContain('old.payment_recorded_at is not null')
    expect(sql).toContain('coalesce(old.amount_paid, 0) > 0')
    expect(sql).toContain('before insert or update on public.class_registrations')
  })
})
