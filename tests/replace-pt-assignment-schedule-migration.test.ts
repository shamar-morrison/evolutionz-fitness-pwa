import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260509_add_replace_pt_assignment_schedule_rpc.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('replace PT assignment schedule migration', () => {
  it('defines an atomic rpc that replaces the assignment schedule without rewriting trainer_clients.session_time', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const normalizedSql = normalizeSql(sql)

    expect(normalizedSql).toContain('create or replace function public.replace_pt_assignment_schedule(')
    expect(normalizedSql).toContain('p_assignment_id uuid')
    expect(normalizedSql).toContain('p_sessions_per_week integer')
    expect(normalizedSql).toContain('p_scheduled_days text[]')
    expect(normalizedSql).toContain('p_schedule jsonb')
    expect(normalizedSql).toContain('returns uuid')
    expect(normalizedSql).toContain('update public.trainer_clients')
    expect(normalizedSql).toContain(
      "set sessions_per_week = p_sessions_per_week, scheduled_days = coalesce(p_scheduled_days, '{}'::text[]), updated_at = now()",
    )
    expect(normalizedSql).not.toContain('session_time = p_')
    expect(normalizedSql).toContain("raise exception 'pt assignment not found.';")
    expect(normalizedSql).toContain('delete from public.training_plan_days where assignment_id = p_assignment_id;')
    expect(normalizedSql).toContain("from jsonb_to_recordset(coalesce(p_schedule, '[]'::jsonb))")
    expect(normalizedSql).toContain('session_time time')
    expect(normalizedSql).toContain('training_type_name text')
    expect(normalizedSql).toContain('return p_assignment_id;')
  })

  it('restricts execute access on the rpc to the service role', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'revoke all on function public.replace_pt_assignment_schedule(uuid, integer, text[], jsonb) from public, anon, authenticated;',
    )
    expect(normalizedSql).toContain(
      'grant execute on function public.replace_pt_assignment_schedule(uuid, integer, text[], jsonb) to service_role;',
    )
  })
})
