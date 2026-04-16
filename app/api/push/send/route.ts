import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/server-auth'
import { sendPushToProfiles } from '@/lib/web-push'

export const maxDuration = 30

const sendSchema = z
  .object({
    profileIds: z.array(z.string().trim().uuid()).min(1),
    title: z.string().trim().min(1),
    body: z.string().trim().min(1),
    url: z.string().trim().min(1).optional(),
  })
  .strict()

function createErrorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status })
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdminUser()
    if ('response' in authResult) return authResult.response

    const body = sendSchema.parse(await request.json())

    await sendPushToProfiles(body.profileIds, {
      title: body.title,
      body: body.body,
      url: body.url,
    })

    return NextResponse.json({ ok: true })
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
        : 'Unexpected server error while sending push notifications.',
      500,
    )
  }
}
