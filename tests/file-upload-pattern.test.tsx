// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Pattern } from '@/components/ui/file-upload'
import type { FileWithPreview } from '@/hooks/use-file-upload'

function EditMemberModalHarness({
  onFileChange,
}: {
  onFileChange: (file: FileWithPreview | null) => void
}) {
  const [selectedFile, setSelectedFile] = useState<FileWithPreview | null>(null)

  const handleFileChange = (file: FileWithPreview | null) => {
    onFileChange(file)
    setSelectedFile(file)
  }

  return (
    <>
      <Pattern onFileChange={handleFileChange} />
      <output data-testid="selected-file">{selectedFile?.name ?? 'none'}</output>
    </>
  )
}

function getSelectedFileName(container: HTMLDivElement) {
  const output = container.querySelector('[data-testid="selected-file"]')

  if (!(output instanceof HTMLOutputElement)) {
    throw new Error('Selected file output not found.')
  }

  return output.textContent
}

describe('Pattern file upload', () => {
  let container: HTMLDivElement
  let root: Root
  let createObjectURLDescriptor: PropertyDescriptor | undefined
  let revokeObjectURLDescriptor: PropertyDescriptor | undefined
  let createObjectURLMock: ReturnType<typeof vi.fn>
  let revokeObjectURLMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    createObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    revokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    createObjectURLMock = vi.fn((file: File) => `blob:${file.name}`)
    revokeObjectURLMock = vi.fn()

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURLMock,
    })

    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURLMock,
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    container.remove()
    document.body.innerHTML = ''

    if (createObjectURLDescriptor) {
      Object.defineProperty(URL, 'createObjectURL', createObjectURLDescriptor)
    } else {
      delete (URL as unknown as Record<string, unknown>)['createObjectURL']
    }

    if (revokeObjectURLDescriptor) {
      Object.defineProperty(URL, 'revokeObjectURL', revokeObjectURLDescriptor)
    } else {
      delete (URL as unknown as Record<string, unknown>)['revokeObjectURL']
    }

    vi.restoreAllMocks()
  })

  it('reports the selected file, clears it on remove, and avoids render-phase warnings', async () => {
    const onFileChange = vi.fn<(file: FileWithPreview | null) => void>()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      root.render(<EditMemberModalHarness onFileChange={onFileChange} />)
    })

    const input = container.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Upload input not found.')
    }

    const photo = new File(['avatar-bytes'], 'avatar.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [photo],
    })

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(onFileChange).toHaveBeenCalledTimes(1)
    expect(onFileChange.mock.calls[0]?.[0]).toMatchObject({
      name: 'avatar.png',
      type: 'image/png',
    })
    expect(getSelectedFileName(container)).toBe('avatar.png')

    const removeButton = container.querySelector('button[aria-label="Remove avatar"]')
    if (!(removeButton instanceof HTMLButtonElement)) {
      throw new Error('Remove button not found.')
    }

    await act(async () => {
      removeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onFileChange).toHaveBeenCalledTimes(2)
    expect(onFileChange.mock.calls[1]?.[0]).toBeNull()
    expect(getSelectedFileName(container)).toBe('none')
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:avatar.png')

    const errorOutput = consoleErrorSpy.mock.calls
      .map((call) => call.map((value) => String(value)).join(' '))
      .join('\n')

    expect(errorOutput).not.toContain('Cannot update a component')
    expect(errorOutput).not.toContain('while rendering a different component')
  })
})
