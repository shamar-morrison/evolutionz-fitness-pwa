import { describe, expect, it } from 'vitest'
import { calculateClassRegistrationAmount } from '@/lib/classes'
import type { Class } from '@/types'

function buildClass(overrides: Partial<Class> = {}): Class {
  return {
    id: overrides.id ?? 'class-1',
    name: overrides.name ?? 'Weight Loss Club',
    schedule_description: overrides.schedule_description ?? '3 times per week',
    per_session_fee:
      Object.prototype.hasOwnProperty.call(overrides, 'per_session_fee')
        ? (overrides.per_session_fee ?? null)
        : null,
    monthly_fee:
      Object.prototype.hasOwnProperty.call(overrides, 'monthly_fee')
        ? (overrides.monthly_fee ?? null)
        : 15500,
    trainer_compensation_pct: overrides.trainer_compensation_pct ?? 30,
    current_period_start: overrides.current_period_start ?? null,
    created_at: overrides.created_at ?? '2026-04-01T00:00:00.000Z',
  }
}

describe('classes billing helpers', () => {
  it('uses the configured monthly fee when monthly is selected', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass({
          current_period_start: null,
          monthly_fee: 15500,
        }),
        fee_type: 'monthly',
      }),
    ).toBe(15500)
  })

  it('uses the configured per-session fee when per-session is selected', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass({
          per_session_fee: 2800,
        }),
        fee_type: 'per_session',
      }),
    ).toBe(2800)
  })

  it('uses the custom amount when custom is selected', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass(),
        fee_type: 'custom',
        custom_amount: 4200,
      }),
    ).toBe(4200)
  })

  it('defaults to monthly when both configured fees exist', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass({
          monthly_fee: 15500,
          per_session_fee: 2500,
        }),
      }),
    ).toBe(15500)
  })

  it('defaults to the configured monthly fee when it is the only preset option', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass({
          per_session_fee: null,
          monthly_fee: 5500,
        }),
      }),
    ).toBe(5500)
  })

  it('defaults to the configured per-session fee when it is the only preset option', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass({
          per_session_fee: 4000,
          monthly_fee: null,
        }),
      }),
    ).toBe(4000)
  })

  it('returns null when the selected preset fee is not configured', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass({
          monthly_fee: null,
          per_session_fee: null,
        }),
        fee_type: 'monthly',
      }),
    ).toBeNull()
  })

  it('returns null when the custom amount is invalid', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass(),
        fee_type: 'custom',
        custom_amount: Number.NaN,
      }),
    ).toBeNull()
  })

  it('returns null when the custom amount is zero', () => {
    expect(
      calculateClassRegistrationAmount({
        classItem: buildClass(),
        fee_type: 'custom',
        custom_amount: 0,
      }),
    ).toBeNull()
  })
})
