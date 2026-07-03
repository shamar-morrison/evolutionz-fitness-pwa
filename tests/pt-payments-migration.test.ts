import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260521_add_pt_payments.sql',
)
const paymentMethodCheckMigrationPath = join(
  process.cwd(),
  'supabase/migrations/20260527_add_pt_payments_payment_method_check.sql',
)

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase()
}

describe('pt_payments migration', () => {
  it('creates the service-role-only PT payments table', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const normalizedSql = normalizeSql(sql)

    expect(normalizedSql).toContain('create table public.pt_payments')
    expect(normalizedSql).toContain('member_id uuid not null references public.members(id) on delete cascade')
    expect(normalizedSql).toContain('assignment_id uuid not null references public.trainer_clients(id) on delete cascade')
    expect(normalizedSql).toContain('trainer_id uuid not null references public.profiles(id) on delete cascade')
    expect(normalizedSql).toContain('amount integer not null check (amount > 0)')
    expect(normalizedSql).toContain('months_covered integer not null default 1 check (months_covered > 0)')
    expect(normalizedSql).toContain('payment_date date not null')
    expect(normalizedSql).toContain('recorded_by uuid not null references public.profiles(id)')
    expect(normalizedSql).toContain('create index pt_payments_member_id_idx on public.pt_payments (member_id)')
    expect(normalizedSql).toContain('create index pt_payments_trainer_id_idx on public.pt_payments (trainer_id)')
    expect(normalizedSql).toContain('create index pt_payments_payment_date_idx on public.pt_payments (payment_date)')
    expect(normalizedSql).toContain('alter table public.pt_payments enable row level security')
    expect(normalizedSql).toContain('revoke all on table public.pt_payments from public, anon, authenticated')
    expect(normalizedSql).toContain('grant all on table public.pt_payments to service_role')
  })

  it('adds the PT payment method check constraint in a follow-up migration', () => {
    const sql = readFileSync(paymentMethodCheckMigrationPath, 'utf8')
    const normalizedSql = normalizeSql(sql)

    expect(normalizedSql).toContain('alter table public.pt_payments add constraint pt_payments_payment_method_check')
    expect(normalizedSql).toContain("check (payment_method in ('cash', 'fygaro', 'bank_transfer', 'point_of_sale'))")
  })
})
