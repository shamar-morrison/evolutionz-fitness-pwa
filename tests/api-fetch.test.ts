import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'

describe('apiFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('parses a successful response with the provided schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        value: 'loaded',
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiFetch(
        '/api/example',
        {
          method: 'GET',
        },
        z.object({
          value: z.string(),
        }),
        'Failed to load data.',
      ),
    ).resolves.toEqual({
      value: 'loaded',
    })
  })

  it('uses an empty init object when the init argument is undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        value: 'loaded',
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiFetch(
        '/api/example',
        undefined,
        z.object({
          value: z.string(),
        }),
        'Failed to load data.',
      ),
    ).resolves.toEqual({
      value: 'loaded',
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/example', {})
  })

  it('falls back to the provided error message when JSON parsing fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiFetch(
        '/api/example',
        {
          method: 'GET',
        },
        z.object({
          value: z.string(),
        }),
        'Failed to load data.',
      ),
    ).rejects.toThrow('Failed to load data.')
  })

  it('surfaces the server error message when the response body sets ok to false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: false,
        error: 'Server rejected the request.',
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiFetch(
        '/api/example',
        {
          method: 'POST',
        },
        z.object({
          value: z.string(),
        }),
        'Failed to load data.',
      ),
    ).rejects.toThrow('Server rejected the request.')
  })

  it('uses the fallback error message when schema parsing fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        value: 123,
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiFetch(
        '/api/example',
        {
          method: 'GET',
        },
        z.object({
          value: z.string(),
        }),
        'Failed to load data.',
      ),
    ).rejects.toThrow('Failed to load data.')
  })

  it('uses the fallback error message for non-OK responses without an error payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        message: 'Not enough detail',
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiFetch(
        '/api/example',
        {
          method: 'DELETE',
        },
        z.object({
          value: z.string(),
        }),
        'Failed to delete data.',
      ),
    ).rejects.toThrow('Failed to delete data.')
  })
})
