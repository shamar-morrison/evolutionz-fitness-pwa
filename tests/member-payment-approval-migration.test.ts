import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260415_approve_member_payment_request.sql',
)

describe('member payment approval migration', () => {
  it('approves the request and records the payment atomically in one function', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('create or replace function public.approve_member_payment_request(')
    expect(sql).toContain('returns uuid')
    expect(sql).toContain("raise exception 'Member payment request not found.';")
    expect(sql).toContain("raise exception 'This request has already been reviewed.';")
    expect(sql).toContain("raise exception 'Membership type is required to approve this payment request.';")
    expect(sql).toContain('insert into public.member_payments')
    expect(sql).toContain('v_request.payment_type')
    expect(sql).toContain('v_request.amount')
    expect(sql).toContain('v_request.requested_by')
    expect(sql).toContain('p_membership_begin_time')
    expect(sql).toContain('p_membership_end_time')
    expect(sql).toContain('update public.member_payment_requests')
    expect(sql).toContain("set status = 'approved',")
    expect(sql).toContain('return v_inserted_payment_id;')
  })

  it('conditionally updates the member type only for membership approvals', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain("if v_request.payment_type = 'membership'")
    expect(sql).toContain('coalesce(v_request.member_type_id, v_member.member_type_id)')
    expect(sql).toContain('update public.members')
    expect(sql).toContain('type = v_next_member_type_name')
    expect(sql).toContain("nullif(btrim(v_request.notes), '')")
  })
})
