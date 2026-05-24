import { z } from 'zod'
import { JAMAICA_OFFSET, JAMAICA_TIME_ZONE } from '@/lib/jamaica-time'
import { getJamaicaDateValue } from '@/lib/pt-scheduling'

export const MEDICAL_ASSIGNMENT_STATUSES = ['active', 'completed'] as const
export type MedicalAssignmentStatus = typeof MEDICAL_ASSIGNMENT_STATUSES[number]

const medicalAssignmentSchema = z.object({
  id: z.string().trim().min(1, 'Assignment id is required.'),
  memberId: z.string().trim().min(1, 'Member id is required.'),
  memberName: z.string().trim().min(1, 'Member name is required.'),
  memberType: z.string().trim().min(1, 'Membership type is required.'),
  memberStatus: z.string().trim().min(1, 'Member status is required.'),
  memberPhotoUrl: z.string().trim().min(1).nullable(),
  staffId: z.string().trim().min(1, 'Staff id is required.'),
  staffName: z.string().trim().min(1, 'Staff name is required.'),
  status: z.enum(MEDICAL_ASSIGNMENT_STATUSES),
  followUpDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable(),
  completedAt: z.string().trim().min(1).nullable(),
  completedBy: z.string().trim().min(1).nullable(),
  createdBy: z.string().trim().min(1, 'Creator id is required.'),
  createdAt: z.string().trim().min(1, 'Created timestamp is required.'),
  updatedAt: z.string().trim().min(1, 'Updated timestamp is required.'),
})

const medicalVisitNoteSchema = z.object({
  id: z.string().trim().min(1, 'Visit note id is required.'),
  assignmentId: z.string().trim().min(1, 'Assignment id is required.'),
  visitDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u),
  notes: z.string().nullable(),
  followUpDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable(),
  createdBy: z.string().trim().min(1, 'Creator id is required.'),
  createdByName: z.string().trim().min(1).nullable(),
  createdAt: z.string().trim().min(1, 'Created timestamp is required.'),
  updatedAt: z.string().trim().min(1, 'Updated timestamp is required.'),
})

const assignmentsResponseSchema = z.object({
  assignments: z.array(medicalAssignmentSchema).default([]),
})

const assignmentResponseSchema = z.object({
  ok: z.literal(true),
  assignment: medicalAssignmentSchema,
})

const notesResponseSchema = z.object({
  notes: z.array(medicalVisitNoteSchema).default([]),
})

const noteResponseSchema = z.object({
  ok: z.literal(true),
  note: medicalVisitNoteSchema,
})

type ErrorResponse = {
  ok?: false
  error: string
}

export type MedicalAssignment = z.infer<typeof medicalAssignmentSchema>
export type MedicalVisitNote = z.infer<typeof medicalVisitNoteSchema>

export type MedicalAssignmentFilters = {
  memberId?: string
  staffId?: string
  status?: MedicalAssignmentStatus
}

export type CreateMedicalAssignmentData = {
  memberId: string
  staffId: string
}

export type AddMedicalVisitNoteData = {
  visitDate: string
  notes?: string | null
  followUpDate?: string
}

function parseErrorMessage(responseBody: ErrorResponse | null, fallbackMessage: string) {
  return responseBody?.error ?? fallbackMessage
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  return normalizedValue || null
}

function createError(message: string) {
  return new Error(message)
}

function buildAssignmentSearchParams(filters: MedicalAssignmentFilters = {}) {
  const searchParams = new URLSearchParams()

  if (filters.memberId) {
    searchParams.set('memberId', filters.memberId)
  }

  if (filters.staffId) {
    searchParams.set('staffId', filters.staffId)
  }

  if (filters.status) {
    searchParams.set('status', filters.status)
  }

  return searchParams
}

function parseAssignmentResponse(input: unknown) {
  const parsed = assignmentResponseSchema.safeParse(input)

  if (!parsed.success) {
    throw createError('Failed to read the medical assignment response.')
  }

  return parsed.data.assignment
}

async function parseErrorResponse(response: Response) {
  try {
    return (await response.json()) as ErrorResponse
  } catch {
    return null
  }
}

export async function fetchMedicalAssignments(
  filters: MedicalAssignmentFilters = {},
): Promise<MedicalAssignment[]> {
  const searchParams = buildAssignmentSearchParams(filters)
  const response = await fetch(
    `/api/medical/assignments${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`,
    {
      method: 'GET',
    },
  )

  const responseBody = response.ok
    ? await response.json().catch(() => null)
    : await parseErrorResponse(response)

  if (!response.ok) {
    throw createError(parseErrorMessage(responseBody, 'Failed to load medical assignments.'))
  }

  const parsed = assignmentsResponseSchema.safeParse(responseBody)

  if (!parsed.success) {
    throw createError('Failed to load medical assignments.')
  }

  return parsed.data.assignments
}

export async function fetchMedicalAssignment(id: string): Promise<MedicalAssignment> {
  const response = await fetch(`/api/medical/assignments/${encodeURIComponent(id)}`, {
    method: 'GET',
  })
  const responseBody = response.ok
    ? await response.json().catch(() => null)
    : await parseErrorResponse(response)

  if (!response.ok) {
    throw createError(parseErrorMessage(responseBody, 'Failed to load the medical assignment.'))
  }

  return parseAssignmentResponse(responseBody)
}

export async function createMedicalAssignment(
  data: CreateMedicalAssignmentData,
): Promise<MedicalAssignment> {
  const response = await fetch('/api/medical/assignments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      memberId: data.memberId,
      staffId: data.staffId,
    }),
  })
  const responseBody = response.ok
    ? await response.json().catch(() => null)
    : await parseErrorResponse(response)

  if (!response.ok) {
    throw createError(parseErrorMessage(responseBody, 'Failed to create the assignment.'))
  }

  return parseAssignmentResponse(responseBody)
}

export async function completeMedicalAssignment(id: string): Promise<MedicalAssignment> {
  const response = await fetch(`/api/medical/assignments/${encodeURIComponent(id)}/complete`, {
    method: 'PATCH',
  })
  const responseBody = response.ok
    ? await response.json().catch(() => null)
    : await parseErrorResponse(response)

  if (!response.ok) {
    throw createError(parseErrorMessage(responseBody, 'Failed to complete the assignment.'))
  }

  return parseAssignmentResponse(responseBody)
}

export async function updateMedicalAssignmentFollowUp(
  id: string,
  followUpDate: string | null,
): Promise<MedicalAssignment> {
  const response = await fetch(`/api/medical/assignments/${encodeURIComponent(id)}/follow-up`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      followUpDate,
    }),
  })
  const responseBody = response.ok
    ? await response.json().catch(() => null)
    : await parseErrorResponse(response)

  if (!response.ok) {
    throw createError(parseErrorMessage(responseBody, 'Failed to update the follow-up date.'))
  }

  return parseAssignmentResponse(responseBody)
}

export async function fetchMedicalVisitNotes(
  assignmentId: string,
): Promise<MedicalVisitNote[]> {
  const response = await fetch(
    `/api/medical/assignments/${encodeURIComponent(assignmentId)}/notes`,
    {
      method: 'GET',
    },
  )
  const responseBody = response.ok
    ? await response.json().catch(() => null)
    : await parseErrorResponse(response)

  if (!response.ok) {
    throw createError(parseErrorMessage(responseBody, 'Failed to load visit notes.'))
  }

  const parsed = notesResponseSchema.safeParse(responseBody)

  if (!parsed.success) {
    throw createError('Failed to load visit notes.')
  }

  return parsed.data.notes
}

export async function addMedicalVisitNote(
  assignmentId: string,
  data: AddMedicalVisitNoteData,
): Promise<MedicalVisitNote> {
  const response = await fetch(
    `/api/medical/assignments/${encodeURIComponent(assignmentId)}/notes`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        visitDate: data.visitDate,
        notes: normalizeOptionalText(data.notes),
        ...(data.followUpDate ? { followUpDate: data.followUpDate } : {}),
      }),
    },
  )
  const responseBody = response.ok
    ? await response.json().catch(() => null)
    : await parseErrorResponse(response)

  if (!response.ok) {
    throw createError(parseErrorMessage(responseBody, 'Failed to add the visit note.'))
  }

  const parsed = noteResponseSchema.safeParse(responseBody)

  if (!parsed.success) {
    throw createError('Failed to read the visit note response.')
  }

  return parsed.data.note
}

export function formatMedicalDate(value: string | null | undefined) {
  if (!value) {
    return 'Not set'
  }

  const date = new Date(`${value}T00:00:00${JAMAICA_OFFSET}`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatMedicalTimestamp(value: string | null | undefined) {
  if (!value) {
    return 'Unknown'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatMedicalDateFromTimestamp(value: string | null | undefined) {
  if (!value) {
    return 'Unknown'
  }

  const dateValue = getJamaicaDateValue(value)

  return formatMedicalDate(dateValue ?? value)
}

export function getTodayMedicalDateValue() {
  return getJamaicaDateValue(new Date().toISOString()) ?? ''
}

export function isMedicalFollowUpDue(
  followUpDate: string | null | undefined,
  todayDateValue = getTodayMedicalDateValue(),
) {
  if (!followUpDate || !todayDateValue) {
    return false
  }

  return followUpDate <= todayDateValue
}
