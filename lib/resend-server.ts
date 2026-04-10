import { getRequiredServerEnv } from '@/lib/server-env'

type SendResendEmailInput = {
  to: string
  subject: string
  text: string
  html: string
}

type ResendSuccessResponse = {
  id: string
}

type ResendErrorResponse = {
  error?: {
    message?: string
  }
  message?: string
}

function getResendErrorMessage(responseBody: unknown) {
  if (
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'error' in responseBody &&
    responseBody.error &&
    typeof responseBody.error === 'object' &&
    'message' in responseBody.error &&
    typeof responseBody.error.message === 'string'
  ) {
    return responseBody.error.message
  }

  if (
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'message' in responseBody &&
    typeof responseBody.message === 'string'
  ) {
    return responseBody.message
  }

  return null
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

export async function sendResendEmail(input: SendResendEmailInput): Promise<ResendSuccessResponse> {
  const apiKey = getRequiredServerEnv('RESEND_API_KEY')
  const fromAddress = getRequiredServerEnv('MEMBERSHIP_EXPIRY_EMAIL_FROM')
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)
  let response: Response

  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('Timed out while sending the reminder email.')
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  let responseBody: ResendSuccessResponse | ResendErrorResponse | null = null

  try {
    responseBody = (await response.json()) as ResendSuccessResponse | ResendErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || typeof responseBody !== 'object' || !('id' in responseBody)) {
    throw new Error(getResendErrorMessage(responseBody) ?? 'Failed to send the reminder email.')
  }

  return responseBody
}
