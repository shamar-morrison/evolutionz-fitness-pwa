import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260510_add_delete_pt_sessions_and_archive_notifications_rpc.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('delete PT sessions and archive notifications migration', () => {
  it('defines an rpc that deletes PT sessions and archives matching notifications atomically', () => {
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
    expect(normalizedSql).toContain('update public.notifications set archived_at = next_archived_at')
    expect(normalizedSql).toContain(
      "type in ( 'reschedule_request', 'reschedule_approved', 'reschedule_denied', 'status_change_request', 'status_change_approved', 'status_change_denied' )",
    )
    expect(normalizedSql).toContain("metadata->>'sessionid' = any(target_session_id_texts);")
  })

  it('restricts execute access on the rpc to the service role', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'revoke all on function public.delete_pt_sessions_and_archive_notifications(uuid[], timestamptz) from public, anon, authenticated;',
    )
    expect(normalizedSql).toContain(
      'grant execute on function public.delete_pt_sessions_and_archive_notifications(uuid[], timestamptz) to service_role;',
    )
  })
})
