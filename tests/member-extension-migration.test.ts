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

const memberExtensionIndexesAndConstraintMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260424_add_member_extension_request_indexes_and_duration_constraint.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('member extension request migrations', () => {
  it('creates the member_extension_requests table with the requested policies', () => {
    const sql = normalizeSql(readFileSync(memberExtensionRequestsMigrationPath, 'utf8'))

    expect(sql).toContain('create table public.member_extension_requests')
    expect(sql).toContain('member_id uuid not null references public.members(id) on delete cascade')
    expect(sql).toContain('requested_by uuid not null references public.profiles(id)')
    expect(sql).toContain('duration_days integer not null,')
    expect(sql).toContain(
      "status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'))",
    )
    expect(sql).toContain('reviewed_by uuid references public.profiles(id)')
    expect(sql).toContain('review_timestamp timestamptz')
    expect(sql).not.toContain('duration_days > 0')
    expect(sql).not.toContain('member_extension_requests_status_created_at_idx')
    expect(sql).not.toContain('member_extension_requests_member_id_created_at_idx')
    expect(sql).not.toContain('member_extension_requests_requested_by_idx')
    expect(sql).toContain('alter table public.member_extension_requests enable row level security;')
    expect(sql).toContain('create policy "admins full access" on public.member_extension_requests')
    expect(sql).toContain(
      'create policy "staff can insert own requests" on public.member_extension_requests',
    )
    expect(sql).toContain(
      'create policy "staff can read requests" on public.member_extension_requests',
    )
  })

  it('adds the duration_days check constraint and supporting indexes in a follow-up migration', () => {
    const sql = normalizeSql(
      readFileSync(memberExtensionIndexesAndConstraintMigrationPath, 'utf8'),
    )

    expect(sql).toContain('alter table public.member_extension_requests add constraint member_extension_requests_duration_days_check check (duration_days > 0);')
    expect(sql).toContain(
      'create index member_extension_requests_status_created_at_idx on public.member_extension_requests (status, created_at desc);',
    )
    expect(sql).toContain(
      'create index member_extension_requests_member_id_created_at_idx on public.member_extension_requests (member_id, created_at desc);',
    )
    expect(sql).toContain(
      'create index member_extension_requests_requested_by_idx on public.member_extension_requests (requested_by);',
    )
  })

  it('adds member_extension_request to the notifications type constraint', () => {
    const sql = normalizeSql(readFileSync(memberExtensionNotificationMigrationPath, 'utf8'))

    expect(sql).toContain('drop constraint if exists notifications_type_check')
    expect(sql).toContain('add constraint notifications_type_check')
    expect(sql).toContain('check (type in (')
    expect(sql).toContain("'member_extension_request'")
  })
})
