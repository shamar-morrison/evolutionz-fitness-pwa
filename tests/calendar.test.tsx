// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Calendar } from '@/components/ui/calendar'

const APRIL_2026 = new Date('2026-04-01T12:00:00.000Z')

describe('Calendar', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    container.remove()
    document.body.innerHTML = ''
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
  })

  it('renders month and year dropdowns by default', async () => {
    await act(async () => {
      root.render(<Calendar mode="single" defaultMonth={APRIL_2026} />)
    })

    const dropdowns = container.querySelectorAll('select')

    expect(dropdowns).toHaveLength(2)
  })

  it('still supports the label caption override', async () => {
    await act(async () => {
      root.render(
        <Calendar mode="single" defaultMonth={APRIL_2026} captionLayout="label" />,
      )
    })

    expect(container.querySelectorAll('select')).toHaveLength(0)
    expect(container.textContent).toContain('April 2026')
  })
})
