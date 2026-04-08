// @vitest-environment jsdom

import { act, useEffect, useState } from 'react'
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

function ControlledPatternHarness() {
  const [selectedFile, setSelectedFile] = useState<FileWithPreview | null>(null)
  const [isPatternMounted, setIsPatternMounted] = useState(true)

  useEffect(() => {
    const previewUrl = selectedFile?.preview

    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [selectedFile])

  return (
    <>
      <button type="button" onClick={() => setIsPatternMounted((current) => !current)}>
        {isPatternMounted ? 'Unmount Pattern' : 'Mount Pattern'}
      </button>
      {isPatternMounted ? <Pattern onFileChange={setSelectedFile} selectedFile={selectedFile} /> : null}
      <output data-testid="controlled-selected-file">{selectedFile?.name ?? 'none'}</output>
    </>
  )
}

function getSelectedFileName(container: HTMLDivElement, testId = 'selected-file') {
  const output = container.querySelector(`[data-testid="${testId}"]`)

  if (!(output instanceof HTMLOutputElement)) {
    throw new Error('Selected file output not found.')
  }

  return output.textContent
}

function getButton(container: HTMLDivElement, label: string) {
  const buttons = Array.from(container.querySelectorAll('button'))
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label)

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  return button
}

describe('Pattern file upload', () => {
  let container: HTMLDivElement
  let root: Root
  let createObjectURLDescriptor: PropertyDescriptor | undefined
  let revokeObjectURLDescriptor: PropertyDescriptor | undefined
  let createObjectURLMock: ReturnType<typeof vi.fn>
  let revokeObjectURLMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
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

    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
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

  it('rehydrates a controlled selected file after remount and clears it on remove', async () => {
    await act(async () => {
      root.render(<ControlledPatternHarness />)
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

    expect(getSelectedFileName(container, 'controlled-selected-file')).toBe('avatar.png')

    const selectedImage = container.querySelector('img')
    if (!(selectedImage instanceof HTMLImageElement)) {
      throw new Error('Selected image preview not found.')
    }

    expect(selectedImage.getAttribute('src')).toBe('blob:avatar.png')

    await act(async () => {
      getButton(container, 'Unmount Pattern').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(revokeObjectURLMock).not.toHaveBeenCalled()

    await act(async () => {
      getButton(container, 'Mount Pattern').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getSelectedFileName(container, 'controlled-selected-file')).toBe('avatar.png')

    const restoredImage = container.querySelector('img')
    if (!(restoredImage instanceof HTMLImageElement)) {
      throw new Error('Restored image preview not found.')
    }

    expect(restoredImage.getAttribute('src')).toBe('blob:avatar.png')

    const removeButton = container.querySelector('button[aria-label="Remove avatar"]')
    if (!(removeButton instanceof HTMLButtonElement)) {
      throw new Error('Remove button not found.')
    }

    await act(async () => {
      removeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getSelectedFileName(container, 'controlled-selected-file')).toBe('none')
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:avatar.png')
  })
})
