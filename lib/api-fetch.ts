import { z } from 'zod'

function getErrorMessage(responseBody: unknown, fallback: string) {
  if (
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'error' in responseBody &&
    typeof responseBody.error === 'string'
  ) {
    return responseBody.error
  }

  return fallback
}

export async function apiFetch<T>(
  input: RequestInfo,
  init: RequestInit = {},
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(input, init)

  let responseBody: unknown | null = null

  try {
    responseBody = await response.json()
  } catch {
    responseBody = null
  }

  if (!response.ok || (responseBody as { ok?: unknown } | null)?.ok === false) {
    throw new Error(getErrorMessage(responseBody, fallbackError))
  }

  try {
    return schema.parse(responseBody)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(fallbackError)
    }

    throw error
  }
}
