import type { ClassWithTrainers } from '@/lib/classes'
import type {
  ClassRegistrationFeeType,
  ClassRegistrationListItem,
} from '@/lib/classes'

export function normalizeOptionalText(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  return normalizedValue || null
}

export function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}

export function resolveClassRegistrationFeeSelection(input: {
  classItem: Pick<ClassWithTrainers, 'monthly_fee' | 'per_session_fee'>
  feeType: ClassRegistrationFeeType
  requestedAmount: number
}) {
  switch (input.feeType) {
    case 'monthly': {
      if (typeof input.classItem.monthly_fee !== 'number') {
        throw new Error('Monthly fee is not configured for this class.')
      }

      return Math.max(0, Math.round(input.classItem.monthly_fee))
    }
    case 'per_session': {
      if (typeof input.classItem.per_session_fee !== 'number') {
        throw new Error('Per-session fee is not configured for this class.')
      }

      return Math.max(0, Math.round(input.classItem.per_session_fee))
    }
    case 'custom': {
      if (!Number.isInteger(input.requestedAmount) || input.requestedAmount < 1) {
        throw new Error('Custom class fee must be a whole-number JMD amount of at least 1.')
      }

      return input.requestedAmount
    }
    default:
      throw new Error('Fee type is invalid.')
  }
}

export function getStoredRegistrationAmount(input: {
  selectedAmount: number
  paymentReceived: boolean
}) {
  return input.paymentReceived ? input.selectedAmount : 0
}

export function getNextPaymentRecordedAt(input: {
  paymentReceived: boolean
  previousPaymentRecordedAt?: string | null
}) {
  if (!input.paymentReceived) {
    return null
  }

  return input.previousPaymentRecordedAt ?? new Date().toISOString()
}

export function isPaymentReceived(registration: Pick<ClassRegistrationListItem, 'amount_paid'>) {
  return registration.amount_paid > 0
}
