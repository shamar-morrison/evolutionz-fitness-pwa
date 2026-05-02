import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260512_make_trainer_client_pt_fee_nullable.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('trainer client PT fee nullable migration', () => {
  it('drops the not-null constraint from trainer_clients.pt_fee', () => {
    const normalizedSql = normalizeSql(readFileSync(migrationPath, 'utf8'))

    expect(normalizedSql).toContain(
      'alter table public.trainer_clients alter column pt_fee drop not null;',
    )
  })
})
