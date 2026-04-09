import { NextResponse } from 'next/server'
import { provisionMemberAccessRequestSchema } from '@/lib/member-job'
import { provisionMemberAccess } from '@/lib/member-provisioning-server'
import { requireAdminUser } from '@/lib/server-auth'

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const requestBody = await request.json()
    const input = provisionMemberAccessRequestSchema.parse(requestBody)
    const result = await provisionMemberAccess({
      name: input.name,
      type: input.type,
      memberTypeId: input.member_type_id ?? null,
      gender: input.gender ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      remark: input.remark ?? null,
      beginTime: input.beginTime,
      endTime: input.endTime,
      cardNo: input.cardNo,
      cardCode: input.cardCode,
    })

    if (!result.ok) {
      return createErrorResponse(result.error, result.status)
    }

    return NextResponse.json({
      ok: true,
      member: result.member,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while provisioning a member.',
      500,
    )
  }
}
