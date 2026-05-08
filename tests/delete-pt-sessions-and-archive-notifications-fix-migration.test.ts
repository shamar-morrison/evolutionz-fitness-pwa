import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260518_fix_delete_pt_sessions_and_archive_notifications_archived_at_alias.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('delete PT sessions and archive notifications fix migration', () => {
  it('redefines the rpc with a qualified archived_at filter on notifications', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'create or replace function public.delete_pt_sessions_and_archive_notifications(',
    )
    expect(normalizedSql).toContain('session_ids uuid[]')
    expect(normalizedSql).toContain('archived_at timestamptz')
    expect(normalizedSql).toContain('returns void')
    expect(normalizedSql).toContain(
      "target_session_ids uuid[] := coalesce(session_ids, '{}'::uuid[]);",
    )
    expect(normalizedSql).toContain(
      'delete from public.pt_sessions where id = any(target_session_ids);',
    )
    expect(normalizedSql).toContain('update public.notifications as n set archived_at = next_archived_at')
    expect(normalizedSql).toContain('where n.archived_at is null')
    expect(normalizedSql).toContain(
      "type in ( 'reschedule_request', 'reschedule_approved', 'reschedule_denied', 'status_change_request', 'status_change_approved', 'status_change_denied' )",
    )
    expect(normalizedSql).toContain("metadata->>'sessionid' = any(target_session_id_texts);")
  })

  it('preserves the rpc execute grants', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'revoke all on function public.delete_pt_sessions_and_archive_notifications(uuid[], timestamptz) from public, anon, authenticated;',
    )
    expect(normalizedSql).toContain(
      'grant execute on function public.delete_pt_sessions_and_archive_notifications(uuid[], timestamptz) to service_role;',
    )
  })
})
