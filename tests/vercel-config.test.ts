import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('vercel.json', () => {
  it('configures the daily membership expiry reminder cron', () => {
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
      crons?: Array<{
        path: string
        schedule: string
      }>
    }

    expect(config.crons).toEqual([
      {
        path: '/api/internal/membership-expiry-emails/run',
        schedule: '0 6 * * *',
      },
    ])
  })
})
