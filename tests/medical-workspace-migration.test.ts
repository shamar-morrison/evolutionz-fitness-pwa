import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260523_add_medical_workspace.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('medical workspace migration', () => {
  it('renames the legacy Medical title and creates the new tables', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain("when title_value.title = 'medical' then 'medical/consultant'")
    expect(normalizedSql).toContain('create table public.medical_assignments')
    expect(normalizedSql).toContain('create table public.medical_visit_notes')
    expect(normalizedSql).toContain("status text not null default 'active' check (status in ('active', 'completed'))")
    expect(normalizedSql).toContain('assignment_id uuid not null references public.medical_assignments(id) on delete cascade')
  })

  it('adds indexes, RLS policies, and updated_at triggers for medical tables', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain('create unique index medical_assignments_member_staff_active_idx')
    expect(normalizedSql).toContain('create index medical_assignments_member_status_idx')
    expect(normalizedSql).toContain('create index medical_assignments_staff_status_idx')
    expect(normalizedSql).toContain('create index medical_visit_notes_assignment_visit_date_idx')
    expect(normalizedSql).toContain('alter table public.medical_assignments enable row level security;')
    expect(normalizedSql).toContain('alter table public.medical_visit_notes enable row level security;')
    expect(normalizedSql).toContain('create policy "admins full access to medical_assignments"')
    expect(normalizedSql).toContain('create policy "medical staff can read own assignments"')
    expect(normalizedSql).toContain('create policy "medical staff can update own assignments"')
    expect(normalizedSql).toContain('create policy "admins full access to medical_visit_notes"')
    expect(normalizedSql).toContain('create policy "medical staff can read own visit notes"')
    expect(normalizedSql).toContain('create policy "medical staff can insert own visit notes"')
    expect(normalizedSql).toContain('create trigger set_updated_at before update on public.medical_assignments')
    expect(normalizedSql).toContain('create trigger set_updated_at before update on public.medical_visit_notes')
  })
})
