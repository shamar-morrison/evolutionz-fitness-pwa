import { afterEach, describe, expect, it, vi } from 'vitest'

const ADMIN_ID = '20000000-0000-4000-8000-000000000001'
const MEDICAL_ID = '20000000-0000-4000-8000-000000000002'
const OTHER_MEDICAL_ID = '20000000-0000-4000-8000-000000000003'
const MEMBER_ID = '20000000-0000-4000-8000-000000000004'
const ASSIGNMENT_ID = '20000000-0000-4000-8000-000000000005'
const NOTE_ID = '20000000-0000-4000-8000-000000000006'

const {
  getSupabaseAdminClientMock,
  readAuthorizedMedicalProfileMock,
  readMedicalAssignmentByIdMock,
  readMedicalAssignmentRowByIdMock,
  readMedicalVisitNotesMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  readAuthorizedMedicalProfileMock: vi.fn(),
  readMedicalAssignmentByIdMock: vi.fn(),
  readMedicalAssignmentRowByIdMock: vi.fn(),
  readMedicalVisitNotesMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/medical-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/medical-server')>(
    '@/lib/medical-server',
  )

  return {
    ...actual,
    readAuthorizedMedicalProfile: readAuthorizedMedicalProfileMock,
    readMedicalAssignmentById: readMedicalAssignmentByIdMock,
    readMedicalAssignmentRowById: readMedicalAssignmentRowByIdMock,
    readMedicalVisitNotes: readMedicalVisitNotesMock,
  }
})

import { GET as getMedicalAssignment } from '@/app/api/medical/assignments/[id]/route'
import { PATCH as completeMedicalAssignment } from '@/app/api/medical/assignments/[id]/complete/route'
import { PATCH as updateMedicalAssignmentFollowUp } from '@/app/api/medical/assignments/[id]/follow-up/route'
import {
  GET as getMedicalVisitNotes,
  POST as postMedicalVisitNote,
} from '@/app/api/medical/assignments/[id]/notes/route'
import { MEDICAL_VISIT_NOTE_SELECT } from '@/lib/medical-server'

function createMedicalAuthResult(
  overrides: Partial<{
    id: string
    role: 'admin' | 'staff'
    can: (permission: string) => boolean
  }> = {},
) {
  const role = overrides.role ?? 'staff'

  return {
    user: {
      id: overrides.id ?? MEDICAL_ID,
      email: 'medical@evolutionzfitness.com',
    },
    profile: {
      id: overrides.id ?? MEDICAL_ID,
      name: role === 'admin' ? 'Admin User' : 'Morgan Medical',
      email: role === 'admin' ? 'admin@evolutionzfitness.com' : 'medical@evolutionzfitness.com',
      role,
      titles: role === 'admin' ? ['Owner'] : ['Medical/Consultant'],
      isSuspended: false,
      phone: null,
      gender: null,
      remark: null,
      specialties: [],
      photoUrl: null,
      archivedAt: null,
      created_at: '2026-05-23T00:00:00.000Z',
    },
    permissions: {
      role,
      can: overrides.can ?? (() => true),
    },
  }
}

function buildAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ASSIGNMENT_ID,
    memberId: MEMBER_ID,
    memberName: 'Client One',
    memberType: 'Monthly',
    memberStatus: 'Active',
    memberPhotoUrl: null,
    staffId: MEDICAL_ID,
    staffName: 'Morgan Medical',
    status: 'active',
    followUpDate: '2026-05-30',
    completedAt: null,
    completedBy: null,
    createdBy: ADMIN_ID,
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
    ...overrides,
  }
}

function buildAssignmentRow(
  overrides: Partial<{
    id: string
    staff_id: string
    status: 'active' | 'completed'
  }> = {},
) {
  return {
    id: overrides.id ?? ASSIGNMENT_ID,
    staff_id: overrides.staff_id ?? MEDICAL_ID,
    status: overrides.status ?? 'active',
  }
}

function buildNote(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: NOTE_ID,
    assignmentId: ASSIGNMENT_ID,
    visitDate: '2026-05-23',
    notes: 'Discussed mobility goals.',
    followUpDate: '2026-05-30',
    createdBy: MEDICAL_ID,
    createdByName: 'Morgan Medical',
    createdAt: '2026-05-23T15:00:00.000Z',
    updatedAt: '2026-05-23T15:00:00.000Z',
    ...overrides,
  }
}

function createAssignmentUpdateClient() {
  const updateValues: Array<Record<string, unknown>> = []

  return {
    updateValues,
    client: {
      from(table: string) {
        expect(table).toBe('medical_assignments')

        return {
          update(values: Record<string, unknown>) {
            updateValues.push(values)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe(ASSIGNMENT_ID)

                return Promise.resolve({
                  error: null,
                })
              },
            }
          },
        }
      },
    },
  }
}

function createVisitNoteClient() {
  const assignmentUpdateValues: Array<Record<string, unknown>> = []
  const noteInsertValues: Array<Record<string, unknown>> = []

  return {
    assignmentUpdateValues,
    noteInsertValues,
    client: {
      from(table: string) {
        if (table === 'medical_visit_notes') {
          return {
            insert(values: Record<string, unknown>) {
              noteInsertValues.push(values)

              return {
                select(columns: string) {
                  expect(columns).toBe(MEDICAL_VISIT_NOTE_SELECT)

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: { id: NOTE_ID },
                        error: null,
                      })
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'medical_assignments') {
          return {
            update(values: Record<string, unknown>) {
              assignmentUpdateValues.push(values)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe(ASSIGNMENT_ID)

                  return Promise.resolve({
                    error: null,
                  })
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('medical assignment action routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    readAuthorizedMedicalProfileMock.mockReset()
    readMedicalAssignmentByIdMock.mockReset()
    readMedicalAssignmentRowByIdMock.mockReset()
    readMedicalVisitNotesMock.mockReset()
  })

  it('allows admins to load another staff member’s assignment detail', async () => {
    const supabase = { from: vi.fn() }
    const assignment = buildAssignment({ staffId: MEDICAL_ID })

    getSupabaseAdminClientMock.mockReturnValue(supabase)
    readAuthorizedMedicalProfileMock.mockResolvedValue(
      createMedicalAuthResult({
        id: ADMIN_ID,
        role: 'admin',
      }),
    )
    readMedicalAssignmentByIdMock.mockResolvedValue(assignment)

    const response = await getMedicalAssignment(new Request('http://localhost'), {
      params: Promise.resolve({ id: ASSIGNMENT_ID }),
    })

    expect(response.status).toBe(200)
    expect(readMedicalAssignmentByIdMock).toHaveBeenCalledWith(supabase, ASSIGNMENT_ID)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      assignment,
    })
  })

  it('rejects assignment detail requests for another medical staff member', async () => {
    getSupabaseAdminClientMock.mockReturnValue({ from: vi.fn() })
    readAuthorizedMedicalProfileMock.mockResolvedValue(
      createMedicalAuthResult({
        id: OTHER_MEDICAL_ID,
      }),
    )
    readMedicalAssignmentByIdMock.mockResolvedValue(buildAssignment({ staffId: MEDICAL_ID }))

    const response = await getMedicalAssignment(new Request('http://localhost'), {
      params: Promise.resolve({ id: ASSIGNMENT_ID }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })

  it('marks an active assignment as complete for the owning medical staff member', async () => {
    const { client, updateValues } = createAssignmentUpdateClient()

    getSupabaseAdminClientMock.mockReturnValue(client)
    readAuthorizedMedicalProfileMock.mockResolvedValue(createMedicalAuthResult())
    readMedicalAssignmentRowByIdMock.mockResolvedValue(buildAssignmentRow())
    readMedicalAssignmentByIdMock.mockResolvedValue(
      buildAssignment({
        status: 'completed',
        completedAt: '2026-05-23T16:00:00.000Z',
        completedBy: MEDICAL_ID,
      }),
    )

    const response = await completeMedicalAssignment(new Request('http://localhost'), {
      params: Promise.resolve({ id: ASSIGNMENT_ID }),
    })

    expect(response.status).toBe(200)
    expect(updateValues).toHaveLength(1)
    expect(updateValues[0]).toMatchObject({
      status: 'completed',
      completed_by: MEDICAL_ID,
    })
    expect(typeof updateValues[0].completed_at).toBe('string')
    await expect(response.json()).resolves.toEqual({
      ok: true,
      assignment: buildAssignment({
        status: 'completed',
        completedAt: '2026-05-23T16:00:00.000Z',
        completedBy: MEDICAL_ID,
      }),
    })
  })

  it('rejects completion requests for assignments that are already completed', async () => {
    getSupabaseAdminClientMock.mockReturnValue({ from: vi.fn() })
    readAuthorizedMedicalProfileMock.mockResolvedValue(createMedicalAuthResult())
    readMedicalAssignmentRowByIdMock.mockResolvedValue(
      buildAssignmentRow({
        status: 'completed',
      }),
    )

    const response = await completeMedicalAssignment(new Request('http://localhost'), {
      params: Promise.resolve({ id: ASSIGNMENT_ID }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Only active medical assignments can be marked as complete.',
    })
    expect(readMedicalAssignmentByIdMock).not.toHaveBeenCalled()
  })

  it('updates the follow-up date for an active assignment and allows clearing it', async () => {
    const { client, updateValues } = createAssignmentUpdateClient()
    const updatedAssignment = buildAssignment({
      followUpDate: null,
    })

    getSupabaseAdminClientMock.mockReturnValue(client)
    readAuthorizedMedicalProfileMock.mockResolvedValue(createMedicalAuthResult())
    readMedicalAssignmentRowByIdMock.mockResolvedValue(buildAssignmentRow())
    readMedicalAssignmentByIdMock.mockResolvedValue(updatedAssignment)

    const response = await updateMedicalAssignmentFollowUp(
      new Request('http://localhost', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          followUpDate: null,
        }),
      }),
      {
        params: Promise.resolve({ id: ASSIGNMENT_ID }),
      },
    )

    expect(response.status).toBe(200)
    expect(updateValues).toEqual([
      {
        follow_up_date: null,
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      assignment: updatedAssignment,
    })
  })

  it('returns visit notes for the owning medical staff member', async () => {
    const supabase = { from: vi.fn() }
    const notes = [buildNote()]

    getSupabaseAdminClientMock.mockReturnValue(supabase)
    readAuthorizedMedicalProfileMock.mockResolvedValue(createMedicalAuthResult())
    readMedicalAssignmentRowByIdMock.mockResolvedValue(buildAssignmentRow())
    readMedicalVisitNotesMock.mockResolvedValue(notes)

    const response = await getMedicalVisitNotes(new Request('http://localhost'), {
      params: Promise.resolve({ id: ASSIGNMENT_ID }),
    })

    expect(response.status).toBe(200)
    expect(readMedicalVisitNotesMock).toHaveBeenCalledWith(supabase, ASSIGNMENT_ID)
    await expect(response.json()).resolves.toEqual({
      notes,
    })
  })

  it('creates a visit note and updates the assignment follow-up date when provided', async () => {
    const { assignmentUpdateValues, client, noteInsertValues } = createVisitNoteClient()
    const createdNote = buildNote({
      notes: 'Trimmed note.',
      followUpDate: '2026-06-01',
    })

    getSupabaseAdminClientMock.mockReturnValue(client)
    readAuthorizedMedicalProfileMock.mockResolvedValue(createMedicalAuthResult())
    readMedicalAssignmentRowByIdMock.mockResolvedValue(buildAssignmentRow())
    readMedicalVisitNotesMock.mockResolvedValue([createdNote])

    const response = await postMedicalVisitNote(
      new Request('http://localhost', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          visitDate: '2026-05-23',
          notes: '  Trimmed note.  ',
          followUpDate: '2026-06-01',
        }),
      }),
      {
        params: Promise.resolve({ id: ASSIGNMENT_ID }),
      },
    )

    expect(response.status).toBe(201)
    expect(noteInsertValues).toEqual([
      {
        assignment_id: ASSIGNMENT_ID,
        visit_date: '2026-05-23',
        notes: 'Trimmed note.',
        follow_up_date: '2026-06-01',
        created_by: MEDICAL_ID,
      },
    ])
    expect(assignmentUpdateValues).toEqual([
      {
        follow_up_date: '2026-06-01',
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      note: createdNote,
    })
  })

  it('creates a visit note without changing the assignment follow-up date when it is omitted', async () => {
    const { assignmentUpdateValues, client, noteInsertValues } = createVisitNoteClient()
    const createdNote = buildNote({
      notes: null,
      followUpDate: null,
    })

    getSupabaseAdminClientMock.mockReturnValue(client)
    readAuthorizedMedicalProfileMock.mockResolvedValue(createMedicalAuthResult())
    readMedicalAssignmentRowByIdMock.mockResolvedValue(buildAssignmentRow())
    readMedicalVisitNotesMock.mockResolvedValue([createdNote])

    const response = await postMedicalVisitNote(
      new Request('http://localhost', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          visitDate: '2026-05-23',
          notes: '   ',
        }),
      }),
      {
        params: Promise.resolve({ id: ASSIGNMENT_ID }),
      },
    )

    expect(response.status).toBe(201)
    expect(noteInsertValues).toEqual([
      {
        assignment_id: ASSIGNMENT_ID,
        visit_date: '2026-05-23',
        notes: null,
        follow_up_date: null,
        created_by: MEDICAL_ID,
      },
    ])
    expect(assignmentUpdateValues).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      note: createdNote,
    })
  })
})
