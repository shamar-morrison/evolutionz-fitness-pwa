import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260414_add_member_payment_receipts.sql',
)

describe('member payment receipt migration', () => {
  it('uses a sequence and trigger to assign formatted receipt numbers atomically', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('create sequence if not exists public.member_payment_receipt_number_seq')
    expect(sql).toContain("nextval('public.member_payment_receipt_number_seq')")
    expect(sql).toContain("'EF-' || v_payment_year || '-' || lpad")
    expect(sql).toContain('create or replace function public.assign_member_payment_receipt_number()')
    expect(sql).toContain('create trigger assign_member_payment_receipt_number_before_insert')
  })

  it('adds a uniqueness guarantee for receipt numbers', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('add column if not exists receipt_number text')
    expect(sql).toContain(
      'create unique index if not exists member_payments_receipt_number_unique_idx',
    )
    expect(sql).toContain('where receipt_number is not null')
  })
})
