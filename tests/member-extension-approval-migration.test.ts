import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260423_approve_member_extension_request.sql',
)

describe('member extension approval migration', () => {
  it('approves the request and updates the membership atomically in one function', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('create or replace function public.approve_member_extension_request(')
    expect(sql).toContain('returns uuid')
    expect(sql).toContain("raise exception 'Member extension request not found.';")
    expect(sql).toContain("raise exception 'This request has already been reviewed.';")
    expect(sql).toContain("raise exception 'Member not found.';")
    expect(sql).toContain("raise exception 'Member has no active membership.';")
    expect(sql).toContain('update public.members')
    expect(sql).toContain('set end_time = v_new_end_time,')
    expect(sql).toContain('update public.member_extension_requests')
    expect(sql).toContain("set status = 'approved',")
    expect(sql).toContain('return v_request.id;')
  })

  it('normalizes naive end times as UTC before updating the member', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain("if p_new_end_time ~ '(?:[zZ]|[+-][0-9]{2}:[0-9]{2})$' then")
    expect(sql).toContain("v_new_end_time := (p_new_end_time || 'Z')::timestamptz;")
    expect(sql).toContain("v_member.status = 'Suspended'")
  })
})
