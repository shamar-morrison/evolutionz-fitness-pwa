import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260416_set_notifications_replica_identity_full.sql',
)

describe('notifications replica identity migration', () => {
  it('sets replica identity full on notifications for realtime update old-row payloads', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('alter table public.notifications replica identity full;')
  })
})
