import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const memberExtensionRequestsMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260422_add_member_extension_requests.sql',
)

const memberExtensionNotificationMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260422_add_member_extension_request_notification_type.sql',
)

describe('member extension request migrations', () => {
  it('creates the member_extension_requests table with the requested policies', () => {
    const sql = readFileSync(memberExtensionRequestsMigrationPath, 'utf8')

    expect(sql).toContain('create table public.member_extension_requests')
    expect(sql).toContain('member_id uuid not null references public.members(id) on delete cascade')
    expect(sql).toContain('requested_by uuid not null references public.profiles(id)')
    expect(sql).toContain('duration_days integer not null')
    expect(sql).toContain(
      "status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'))",
    )
    expect(sql).toContain('reviewed_by uuid references public.profiles(id)')
    expect(sql).toContain('review_timestamp timestamptz')
    expect(sql).toContain('alter table public.member_extension_requests enable row level security;')
    expect(sql).toContain('create policy "Admins full access" on public.member_extension_requests')
    expect(sql).toContain(
      'create policy "Staff can insert own requests" on public.member_extension_requests',
    )
    expect(sql).toContain(
      'create policy "Staff can read requests" on public.member_extension_requests',
    )
  })

  it('adds member_extension_request to the notifications type constraint', () => {
    const sql = readFileSync(memberExtensionNotificationMigrationPath, 'utf8')

    expect(sql).toContain("drop constraint if exists notifications_type_check")
    expect(sql).toContain('add constraint notifications_type_check')
    expect(sql).toContain('check (type in (')
    expect(sql).toContain("'member_extension_request'")
  })
})
