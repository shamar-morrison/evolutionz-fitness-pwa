import { describe, expect, it } from 'vitest'
import { getBaseRpcErrorStatus } from '@/lib/rpc-error-status'

describe('getBaseRpcErrorStatus', () => {
  it('returns 404 for a missing member', () => {
    expect(getBaseRpcErrorStatus('Member not found.')).toBe(404)
  })

  it('returns 400 for shared request review errors', () => {
    expect(getBaseRpcErrorStatus('This request has already been reviewed.')).toBe(400)
  })

  it('returns 400 for inactive membership errors', () => {
    expect(getBaseRpcErrorStatus('Member has no active membership.')).toBe(400)
  })

  it('returns null for unknown messages', () => {
    expect(getBaseRpcErrorStatus('Unexpected RPC error.')).toBeNull()
  })
})
