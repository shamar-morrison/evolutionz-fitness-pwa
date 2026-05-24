import { NextResponse } from 'next/server'
import { buildCardCodeByCardNo } from '@/lib/members'
import { getAssignedCardNo } from '@/lib/member-card'
import { getCleanMemberName } from '@/lib/member-name'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { readStaffProfile } from '@/lib/staff'
import { createClient } from '@/lib/supabase/server'
import type { MedicalAssignment, MedicalAssignmentFilters, MedicalVisitNote } from '@/lib/medical'
import type { CardRecord } from '@/types'

const SUSPENDED_ACCOUNT_ERROR =
  'Your account has been suspended. Please contact an administrator.'

type MedicalMemberRecord = {
  id: string
  name: string
  type: string
  status: string
  photo_url: string | null
  card_no: string | null
} | null

type MedicalStaffRecord = {
  id: string
  name: string
} | null

type MedicalAssignmentRecord = {
  id: string
  member_id: string
  staff_id: string
  status: 'active' | 'completed'
  follow_up_date: string | null
  completed_at: string | null
  completed_by: string | null
  created_by: string
  created_at: string
  updated_at: string
  member: MedicalMemberRecord
  staff: MedicalStaffRecord
}

type MedicalVisitNoteRecord = {
  id: string
  assignment_id: string
  visit_date: string
  notes: string | null
  follow_up_date: string | null
  created_by: string
  created_at: string
  updated_at: string
  creator: MedicalStaffRecord
}

export type MedicalAssignmentRow = Omit<MedicalAssignmentRecord, 'member' | 'staff'> & {
  member: MedicalMemberRecord
  staff: MedicalStaffRecord
}

export type MedicalReadClient = {
  from(table: string): any
}

export const MEDICAL_ASSIGNMENT_SELECT = [
  'id',
  'member_id',
  'staff_id',
  'status',
  'follow_up_date',
  'completed_at',
  'completed_by',
  'created_by',
  'created_at',
  'updated_at',
  'member:member_id ( id, name, type, status, photo_url, card_no )',
  'staff:staff_id ( id, name )',
].join(', ')

export const MEDICAL_VISIT_NOTE_SELECT = [
  'id',
  'assignment_id',
  'visit_date',
  'notes',
  'follow_up_date',
  'created_by',
  'created_at',
  'updated_at',
  'creator:created_by ( id, name )',
].join(', ')

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)
  return normalizedValue || null
}

function normalizeTimestamp(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return null
  }

  const timestamp = new Date(normalizedValue)

  if (Number.isNaN(timestamp.getTime())) {
    return normalizedValue
  }

  return timestamp.toISOString()
}

function normalizeDate(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)

  return /^\d{4}-\d{2}-\d{2}$/u.test(normalizedValue) ? normalizedValue : null
}

async function loadCardCodeLookup(
  supabase: MedicalReadClient,
  assignmentRecords: MedicalAssignmentRecord[],
) {
  const cardNos = Array.from(
    new Set(
      assignmentRecords
        .map((record) => getAssignedCardNo(record.member?.card_no))
        .filter((cardNo): cardNo is string => cardNo !== null),
    ),
  )

  if (cardNos.length === 0) {
    return buildCardCodeByCardNo([])
  }

  const { data, error } = await supabase
    .from('cards')
    .select('card_no, card_code, status, lost_at')
    .in('card_no', cardNos)

  if (error) {
    throw new Error(`Failed to read medical assignment card details: ${error.message}`)
  }

  return buildCardCodeByCardNo((data ?? []) as CardRecord[])
}

function mapMedicalAssignmentRecord(
  record: MedicalAssignmentRecord,
  cardCodeByCardNo: ReturnType<typeof buildCardCodeByCardNo>,
): MedicalAssignment {
  const fallbackMemberName = normalizeText(record.member?.name) || normalizeText(record.member_id)
  const assignedCardNo = getAssignedCardNo(record.member?.card_no)
  const cardCode = assignedCardNo ? cardCodeByCardNo.get(assignedCardNo)?.cardCode ?? null : null
  const memberName = getCleanMemberName(fallbackMemberName, cardCode) || fallbackMemberName

  return {
    id: normalizeText(record.id),
    memberId: normalizeText(record.member_id),
    memberName,
    memberType: normalizeText(record.member?.type) || 'Unknown',
    memberStatus: normalizeText(record.member?.status) || 'Unknown',
    memberPhotoUrl: normalizeNullableText(record.member?.photo_url),
    staffId: normalizeText(record.staff_id),
    staffName: normalizeText(record.staff?.name) || normalizeText(record.staff_id),
    status: record.status,
    followUpDate: normalizeDate(record.follow_up_date),
    completedAt: normalizeTimestamp(record.completed_at),
    completedBy: normalizeNullableText(record.completed_by),
    createdBy: normalizeText(record.created_by),
    createdAt: normalizeTimestamp(record.created_at) ?? record.created_at,
    updatedAt: normalizeTimestamp(record.updated_at) ?? record.updated_at,
  }
}

function mapMedicalVisitNoteRecord(record: MedicalVisitNoteRecord): MedicalVisitNote {
  return {
    id: normalizeText(record.id),
    assignmentId: normalizeText(record.assignment_id),
    visitDate: normalizeDate(record.visit_date) ?? record.visit_date,
    notes: normalizeNullableText(record.notes),
    followUpDate: normalizeDate(record.follow_up_date),
    createdBy: normalizeText(record.created_by),
    createdByName: normalizeNullableText(record.creator?.name),
    createdAt: normalizeTimestamp(record.created_at) ?? record.created_at,
    updatedAt: normalizeTimestamp(record.updated_at) ?? record.updated_at,
  }
}

export async function readMedicalAssignments(
  supabase: MedicalReadClient,
  filters: MedicalAssignmentFilters = {},
) {
  let query = supabase
    .from('medical_assignments')
    .select(MEDICAL_ASSIGNMENT_SELECT)
    .order(filters.status === 'completed' ? 'completed_at' : 'created_at', {
      ascending: false,
    })

  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  if (filters.memberId) {
    query = query.eq('member_id', filters.memberId)
  }

  if (filters.staffId) {
    query = query.eq('staff_id', filters.staffId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to read medical assignments: ${error.message}`)
  }

  const assignmentRecords = (data ?? []) as MedicalAssignmentRecord[]
  const cardCodeByCardNo = await loadCardCodeLookup(supabase, assignmentRecords)

  return assignmentRecords.map((record) => mapMedicalAssignmentRecord(record, cardCodeByCardNo))
}

export async function readMedicalAssignmentById(
  supabase: MedicalReadClient,
  id: string,
) {
  const { data, error } = await supabase
    .from('medical_assignments')
    .select(MEDICAL_ASSIGNMENT_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read medical assignment ${id}: ${error.message}`)
  }

  if (!data) {
    return null
  }

  const assignmentRecord = data as MedicalAssignmentRecord
  const cardCodeByCardNo = await loadCardCodeLookup(supabase, [assignmentRecord])

  return mapMedicalAssignmentRecord(assignmentRecord, cardCodeByCardNo)
}

export async function readMedicalAssignmentRowById(
  supabase: MedicalReadClient,
  id: string,
) {
  const { data, error } = await supabase
    .from('medical_assignments')
    .select(MEDICAL_ASSIGNMENT_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read medical assignment ${id}: ${error.message}`)
  }

  return (data ?? null) as MedicalAssignmentRow | null
}

export async function readMedicalVisitNotes(
  supabase: MedicalReadClient,
  assignmentId: string,
) {
  const { data, error } = await supabase
    .from('medical_visit_notes')
    .select(MEDICAL_VISIT_NOTE_SELECT)
    .eq('assignment_id', assignmentId)
    .order('visit_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to read visit notes for ${assignmentId}: ${error.message}`)
  }

  return ((data ?? []) as MedicalVisitNoteRecord[]).map(mapMedicalVisitNoteRecord)
}

export async function readAuthorizedMedicalProfile() {
  const authResult = await requireAuthenticatedUser()

  if ('response' in authResult) {
    return authResult
  }

  const profile = await readStaffProfile(await createClient(), authResult.user.id)

  if (!profile) {
    return {
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  if (profile.isSuspended) {
    return {
      response: NextResponse.json({ error: SUSPENDED_ACCOUNT_ERROR }, { status: 403 }),
    }
  }

  return {
    user: authResult.user,
    profile,
    permissions: resolvePermissionsForProfile(profile),
  }
}

export function canAccessMedicalAssignment(
  role: string,
  profileId: string,
  assignmentStaffId: string,
) {
  return role === 'admin' || profileId === assignmentStaffId
}
