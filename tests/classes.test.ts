import { describe, expect, it } from 'vitest'
import { calculateClassRegistrationAmount } from '@/lib/classes'
import type { Class } from '@/types'

function buildClass(overrides: Partial<Class> = {}): Class {
  return {
    id: overrides.id ?? 'class-1',
    name: overrides.name ?? 'Weight Loss Club',
    schedule_description: overrides.schedule_description ?? '3 times per week',
    per_session_fee: overrides.per_session_fee ?? null,
    monthly_fee: overrides.monthly_fee ?? 15500,
    trainer_compensation_pct: overrides.trainer_compensation_pct ?? 30,
    current_period_start: overrides.current_period_start ?? null,
    created_at: overrides.created_at ?? '2026-04-01T00:00:00.000Z',
  }
}

describe('classes billing helpers', () => {
  it('returns the full monthly fee when no current period start is set', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass({
          current_period_start: null,
          monthly_fee: 15500,
        }),
        month_start: '2026-04-10',
        registrant_type: 'guest',
      }),
    ).toBe(15500)
  })

  it('pro-rates monthly classes inside the active 28-day period', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass({
          current_period_start: '2026-04-01',
          monthly_fee: 5600,
        }),
        month_start: '2026-04-15',
        registrant_type: 'guest',
      }),
    ).toBe(2800)
  })

  it('returns the full fee when the first class date is before or on the current period start', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass({
          current_period_start: '2026-04-08',
          monthly_fee: 15500,
        }),
        month_start: '2026-04-08',
        registrant_type: 'guest',
      }),
    ).toBe(15500)
  })

  it('returns the full fee when the first class date falls after the active 28-day window', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass({
          current_period_start: '2026-04-01',
          monthly_fee: 15500,
        }),
        month_start: '2026-04-30',
        registrant_type: 'guest',
      }),
    ).toBe(15500)
  })

  it('always uses the per-session fee for Bootcamp', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass({
          name: 'Bootcamp',
          per_session_fee: 1500,
          monthly_fee: 5500,
          current_period_start: '2026-04-01',
        }),
        month_start: '2026-04-15',
        registrant_type: 'guest',
      }),
    ).toBe(1500)
  })

  it('always makes Dance Cardio free for gym members', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass({
          name: 'Dance Cardio',
          per_session_fee: 1000,
          monthly_fee: 4000,
          current_period_start: '2026-04-01',
        }),
        month_start: '2026-04-20',
        registrant_type: 'member',
      }),
    ).toBe(0)
  })
})
