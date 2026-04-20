import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260504_add_class_registration_fee_and_receipts.sql',
)

describe('class registration receipt migration', () => {
  it('adds fee selection, notes, and receipt tracking columns', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('add column if not exists fee_type text')
    expect(sql).toContain('add column if not exists notes text')
    expect(sql).toContain('add column if not exists receipt_number text')
    expect(sql).toContain('add column if not exists receipt_sent_at timestamptz')
    expect(sql).toContain("check (fee_type in ('monthly', 'per_session', 'custom'))")
  })

  it('reuses the shared receipt-number sequence with a dedicated trigger', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain("nextval('public.member_payment_receipt_number_seq')")
    expect(sql).toContain('create or replace function public.assign_class_registration_receipt_number()')
    expect(sql).toContain('create trigger assign_class_registration_receipt_number_before_insert')
    expect(sql).toContain(
      'create unique index if not exists class_registrations_receipt_number_unique_idx',
    )
  })

  it('tracks receipt deliveries with cascade cleanup on registration delete', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('add column if not exists class_registration_id uuid')
    expect(sql).toContain('references public.class_registrations(id) on delete cascade')
    expect(sql).toContain(
      'create unique index if not exists admin_email_deliveries_class_registration_id_unique_idx',
    )
  })
})
