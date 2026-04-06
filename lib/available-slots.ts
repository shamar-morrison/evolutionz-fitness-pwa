import { z } from 'zod'
import type { AvailableAccessSlot } from '@/types'

const availableAccessSlotSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Person ID is required.'),
  cardNo: z.string().trim().min(1, 'Card number is required.'),
  placeholderName: z.string().trim().min(1, 'Placeholder slot name is required.'),
})

const availableSlotsResponseSchema = z.object({
  slots: z.array(availableAccessSlotSchema).default([]),
})

type AvailableSlotsSuccessResponse = {
  ok: true
  slots: AvailableAccessSlot[]
}

type AvailableSlotsErrorResponse = {
  ok: false
  error: string
}

function compareSlots(left: AvailableAccessSlot, right: AvailableAccessSlot) {
  return (
    left.placeholderName.localeCompare(right.placeholderName) ||
    left.cardNo.localeCompare(right.cardNo)
  )
}

export function normalizeAvailableAccessSlots(input: unknown): AvailableAccessSlot[] {
  const parsed = availableSlotsResponseSchema.safeParse(input)

  if (!parsed.success) {
    return []
  }

  const slotsByEmployeeNo = new Map<string, AvailableAccessSlot>()

  for (const slot of parsed.data.slots) {
    const employeeNo = slot.employeeNo.trim()
    const cardNo = slot.cardNo.trim()
    const placeholderName = slot.placeholderName.trim()

    if (!employeeNo || !cardNo || !placeholderName) {
      continue
    }

    slotsByEmployeeNo.set(employeeNo, {
      employeeNo,
      cardNo,
      placeholderName,
    })
  }

  return Array.from(slotsByEmployeeNo.values()).sort(compareSlots)
}

export function formatAvailableAccessSlotLabel(slot: AvailableAccessSlot) {
  return `${slot.placeholderName} • ${slot.employeeNo} • ${slot.cardNo}`
}

export async function fetchAvailableAccessSlots(): Promise<AvailableAccessSlot[]> {
  const response = await fetch('/api/access/slots/available', {
    method: 'GET',
    cache: 'no-store',
  })

  let responseBody: AvailableSlotsSuccessResponse | AvailableSlotsErrorResponse | null = null

  try {
    responseBody = (await response.json()) as AvailableSlotsSuccessResponse | AvailableSlotsErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      responseBody && responseBody.ok === false
        ? responseBody.error
        : 'Failed to load available slots.',
    )
  }

  return normalizeAvailableAccessSlots({ slots: responseBody.slots })
}
