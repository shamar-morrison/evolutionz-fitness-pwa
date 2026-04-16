import { NextResponse } from 'next/server'
import { getCleanMemberName } from '@/lib/member-name'
import {
  getDoorHistoryTodayDateValue,
  normalizeCachedDoorHistoryEvents,
  parseDoorHistoryDateInput,
  sortDoorHistoryEvents,
} from '@/lib/door-history'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { DoorHistoryEvent } from '@/types'

type DoorHistoryCacheRow = {
  cache_date: string | null
  events: unknown
  fetched_at: string | null
  total_matches: number | null
}

type CardRow = {
  card_no: string | null
  card_code: string | null
}

type MemberRow = {
  card_no: string | null
  employee_no: string | null
  name: string | null
}

const ZERO_PADDED_EMPLOYEE_NO_LENGTH = 8

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown) {
  const normalizedValue = normalizeText(value)
  return normalizedValue || null
}

function normalizeInteger(value: unknown, fallback = 0) {
  const numericValue = Number(value)

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    return fallback
  }

  return numericValue
}

function normalizeFetchedAt(value: unknown) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return null
  }

  const parsedValue = new Date(normalizedValue)

  if (Number.isNaN(parsedValue.getTime())) {
    return null
  }

  return parsedValue.toISOString()
}

function canonicalizeEmployeeNo(value: unknown) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue || !/^\d+$/u.test(normalizedValue)) {
    return null
  }

  return normalizedValue.replace(/^0+/, '') || '0'
}

function getEmployeeNoLookupCandidates(value: unknown) {
  const exactEmployeeNo = normalizeText(value)

  if (!exactEmployeeNo) {
    return [] as string[]
  }

  const candidates = [exactEmployeeNo]
  const canonicalEmployeeNo = canonicalizeEmployeeNo(exactEmployeeNo)

  if (!canonicalEmployeeNo) {
    return candidates
  }

  candidates.push(canonicalEmployeeNo)
  candidates.push(canonicalEmployeeNo.padStart(ZERO_PADDED_EMPLOYEE_NO_LENGTH, '0'))

  return Array.from(new Set(candidates))
}

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

function enrichDoorHistoryEvents(
  events: DoorHistoryEvent[],
  cards: CardRow[],
  members: MemberRow[],
) {
  const cardCodeByCardNo = new Map(
    cards
      .map((card) => {
        const cardNo = normalizeText(card.card_no)

        if (!cardNo) {
          return null
        }

        return [cardNo, normalizeNullableText(card.card_code)] as const
      })
      .filter((entry): entry is readonly [string, string | null] => entry !== null),
  )
  const memberNameByCardNo = new Map(
    members
      .map((member) => {
        const cardNo = normalizeText(member.card_no)

        if (!cardNo) {
          return null
        }

        return [cardNo, normalizeText(member.name)] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )
  const memberNameByEmployeeNo = new Map(
    members
      .map((member) => {
        const employeeNo = normalizeText(member.employee_no)
        const memberName = normalizeText(member.name)

        if (!employeeNo || !memberName) {
          return null
        }

        return [employeeNo, memberName] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )

  return sortDoorHistoryEvents(
    events.map((event) => {
      const cardNo = normalizeText(event.cardNo)
      const cardCode = cardCodeByCardNo.get(cardNo) ?? event.cardCode
      let memberName = cardNo ? memberNameByCardNo.get(cardNo) ?? null : null

      if (!cardNo) {
        for (const employeeNoCandidate of getEmployeeNoLookupCandidates(event.employeeNo)) {
          memberName = memberNameByEmployeeNo.get(employeeNoCandidate) ?? null

          if (memberName) {
            break
          }
        }
      }

      return {
        ...event,
        cardCode,
        memberName: memberName ? getCleanMemberName(memberName, cardCode) || memberName : null,
      }
    }),
  )
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { searchParams } = new URL(request.url)
    const requestedDate = searchParams.get('date') ?? getDoorHistoryTodayDateValue()
    const parsedDate = parseDoorHistoryDateInput(requestedDate)

    if (!parsedDate.ok) {
      return createErrorResponse(parsedDate.error, 400)
    }

    const supabase = getSupabaseAdminClient()
    const { data: cachedRow, error: cachedRowError } = await supabase
      .from('door_history_cache')
      .select('cache_date, events, fetched_at, total_matches')
      .eq('cache_date', parsedDate.date)
      .maybeSingle()

    if (cachedRowError) {
      throw new Error(`Failed to read cached door history for ${parsedDate.date}: ${cachedRowError.message}`)
    }

    if (!cachedRow) {
      return NextResponse.json({
        ok: true,
        events: [],
        fetchedAt: null,
        totalMatches: 0,
        cacheDate: parsedDate.date,
      })
    }

    const row = cachedRow as DoorHistoryCacheRow
    const events = normalizeCachedDoorHistoryEvents(row.events)
    const cardNos = Array.from(
      new Set(events.map((event) => normalizeText(event.cardNo)).filter(Boolean)),
    )
    const employeeNos = Array.from(
      new Set(
        events
          .filter((event) => !normalizeText(event.cardNo))
          .flatMap((event) => getEmployeeNoLookupCandidates(event.employeeNo)),
      ),
    )

    let cards: CardRow[] = []
    let members: MemberRow[] = []

    if (cardNos.length > 0) {
      const [{ data: cardRows, error: cardsError }, { data: memberRows, error: membersError }] =
        await Promise.all([
          supabase.from('cards').select('card_no, card_code').in('card_no', cardNos),
          supabase.from('members').select('card_no, employee_no, name').in('card_no', cardNos),
        ])

      if (cardsError) {
        throw new Error(`Failed to read door history card details: ${cardsError.message}`)
      }

      if (membersError) {
        throw new Error(`Failed to read door history members: ${membersError.message}`)
      }

      cards = (cardRows ?? []) as CardRow[]
      members = [...members, ...((memberRows ?? []) as MemberRow[])]
    }

    if (employeeNos.length > 0) {
      const { data: memberRows, error: membersError } = await supabase
        .from('members')
        .select('card_no, employee_no, name')
        .in('employee_no', employeeNos)

      if (membersError) {
        throw new Error(`Failed to read door history members by employee number: ${membersError.message}`)
      }

      members = [...members, ...((memberRows ?? []) as MemberRow[])]
    }

    const enrichedEvents = enrichDoorHistoryEvents(events, cards, members)
    const totalMatches = Math.max(
      normalizeInteger(row.total_matches, 0),
      enrichedEvents.length,
    )

    return NextResponse.json({
      ok: true,
      events: enrichedEvents,
      fetchedAt: normalizeFetchedAt(row.fetched_at),
      totalMatches,
      cacheDate: parsedDate.date,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading door history.',
      500,
    )
  }
}
