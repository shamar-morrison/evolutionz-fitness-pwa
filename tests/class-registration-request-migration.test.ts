import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260505_add_class_registration_request_tables.sql',
)

describe('class registration request tables migration', () => {
  it('creates the edit and removal request tables', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('create table if not exists public.class_registration_edit_requests')
    expect(sql).toContain('create table if not exists public.class_registration_removal_requests')
    expect(sql).toContain('proposed_amount_paid integer not null check (proposed_amount_paid >= 0)')
    expect(sql).toContain("status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'))")
  })

  it('enables rls and defines admin/staff access policies for both tables', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('alter table public.class_registration_edit_requests')
    expect(sql).toContain('alter table public.class_registration_removal_requests')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('create policy "Admin full access to class_registration_edit_requests"')
    expect(sql).toContain('create policy "Staff can read class_registration_edit_requests"')
    expect(sql).toContain('create policy "Staff can insert own class_registration_edit_requests"')
    expect(sql).toContain('create policy "Admin full access to class_registration_removal_requests"')
    expect(sql).toContain('create policy "Staff can read class_registration_removal_requests"')
    expect(sql).toContain('create policy "Staff can insert own class_registration_removal_requests"')
  })

  it('adds the requested indexes for queue and requester lookups', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('class_registration_edit_requests_status_created_at_idx')
    expect(sql).toContain('class_registration_edit_requests_registration_id_idx')
    expect(sql).toContain('class_registration_edit_requests_requested_by_idx')
    expect(sql).toContain('class_registration_removal_requests_status_created_at_idx')
    expect(sql).toContain('class_registration_removal_requests_registration_id_idx')
    expect(sql).toContain('class_registration_removal_requests_requested_by_idx')
  })
})
