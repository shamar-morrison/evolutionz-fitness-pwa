import { NextResponse } from 'next/server'
import { PRIVATE_STABLE_READ_CACHE_CONTROL } from '@/lib/http-cache'
import { PREDEFINED_TRAINING_TYPES } from '@/lib/pt-scheduling'
import { requireAuthenticatedUser } from '@/lib/server-auth'

export async function GET() {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    return NextResponse.json({
      types: [...PREDEFINED_TRAINING_TYPES],
    }, {
      headers: {
        'Cache-Control': PRIVATE_STABLE_READ_CACHE_CONTROL,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unexpected server error while loading training types.',
      },
      { status: 500 },
    )
  }
}
