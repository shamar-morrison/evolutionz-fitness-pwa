import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260511_add_update_pt_assignment_with_schedule_rpc.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('update PT assignment with schedule migration', () => {
  it('defines an atomic rpc that updates trainer_clients and replaces training plan rows together', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'create or replace function public.update_pt_assignment_with_schedule(',
    )
    expect(normalizedSql).toContain('p_assignment_id uuid')
    expect(normalizedSql).toContain('p_sessions_per_week integer')
    expect(normalizedSql).toContain('p_scheduled_days text[]')
    expect(normalizedSql).toContain('p_schedule jsonb')
    expect(normalizedSql).toContain("p_updates jsonb default '{}'::jsonb")
    expect(normalizedSql).toContain('returns uuid')
    expect(normalizedSql).toContain('update public.trainer_clients')
    expect(normalizedSql).toContain(
      "set status = case when next_updates ? 'status' then next_updates->>'status' else status end,",
    )
    expect(normalizedSql).toContain(
      "pt_fee = case when next_updates ? 'ptfee' then (next_updates->>'ptfee')::integer else pt_fee end,",
    )
    expect(normalizedSql).toContain(
      "notes = case when next_updates ? 'notes' then next_notes else notes end,",
    )
    expect(normalizedSql).toContain(
      "sessions_per_week = p_sessions_per_week, scheduled_days = coalesce(p_scheduled_days, '{}'::text[]), updated_at = now()",
    )
    expect(normalizedSql).toContain("raise exception 'pt assignment not found.';")
    expect(normalizedSql).toContain(
      'delete from public.training_plan_days where assignment_id = p_assignment_id;',
    )
    expect(normalizedSql).toContain("from jsonb_to_recordset(coalesce(p_schedule, '[]'::jsonb))")
    expect(normalizedSql).toContain('training_type_name text')
    expect(normalizedSql).toContain('return p_assignment_id;')
  })

  it('restricts execute access on the rpc to the service role', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      "revoke all on function public.update_pt_assignment_with_schedule(uuid, integer, text[], jsonb, jsonb) from public, anon, authenticated;",
    )
    expect(normalizedSql).toContain(
      "grant execute on function public.update_pt_assignment_with_schedule(uuid, integer, text[], jsonb, jsonb) to service_role;",
    )
  })
})
