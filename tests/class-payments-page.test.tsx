// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  currentRoleState,
  refetchMock,
  toastMock,
  useClassPaymentsReportMock,
} = vi.hoisted(() => ({
  currentRoleState: { role: 'admin' as 'admin' | 'staff' },
  refetchMock: vi.fn().mockResolvedValue(undefined),
  toastMock: vi.fn(),
  useClassPaymentsReportMock: vi.fn(),
}))

vi.mock('@/hooks/use-classes', () => ({
  useClassPaymentsReport: useClassPaymentsReportMock,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/classes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/classes')>('@/lib/classes')

  return {
    ...actual,
    getCurrent28DayDateRangeInJamaica: () => ({
      startDate: '2026-03-12',
      endDate: '2026-04-08',
    }),
  }
})

vi.mock('@/components/role-guard', () => ({
  RoleGuard: ({
    role,
    children,
    fallback = null,
  }: {
    role: 'admin' | 'staff'
    children: React.ReactNode
    fallback?: React.ReactNode
  }) => (role === 'admin' && currentRoleState.role !== 'admin' ? <>{fallback}</> : <>{children}</>),
}))

vi.mock('@/components/redirect-on-mount', () => ({
  RedirectOnMount: ({ href }: { href: string }) => <div>{`redirect:${href}`}</div>,
}))

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id: string
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
  }) => (
    <input
      id={id}
      type="checkbox"
      checked={Boolean(checked)}
      readOnly
      onClick={() => onCheckedChange?.(!checked)}
    />
  ),
}))

vi.mock('@/components/ui/radio-group', async () => {
  const React = await import('react')

  const RadioGroupContext = React.createContext<{
    value: string
    onValueChange: (value: string) => void
  } | null>(null)

  function RadioGroup({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value: string
    onValueChange: (value: string) => void
  }) {
    return (
      <RadioGroupContext.Provider value={{ value, onValueChange }}>
        <div>{children}</div>
      </RadioGroupContext.Provider>
    )
  }

  function RadioGroupItem({
    id,
    value,
  }: {
    id: string
    value: string
  }) {
    const context = React.useContext(RadioGroupContext)

    if (!context) {
      return null
    }

    return (
      <input
        id={id}
        type="radio"
        checked={context.value === value}
        onChange={() => context.onValueChange(value)}
      />
    )
  }

  return {
    RadioGroup,
    RadioGroupItem,
  }
})

import ClassPaymentsPage from '@/app/(app)/reports/class-payments/page'

async function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')
  const setValue = descriptor?.set

  if (!setValue) {
    throw new Error('Input value setter is unavailable.')
  }

  await act(async () => {
    setValue.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function setCheckboxChecked(input: HTMLInputElement, checked: boolean) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'checked')
  const setChecked = descriptor?.set

  if (!setChecked) {
    throw new Error('Checkbox checked setter is unavailable.')
  }

  await act(async () => {
    setChecked.call(input, checked)
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function clickButton(container: HTMLDivElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${label} button not found.`)
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('ClassPaymentsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    currentRoleState.role = 'admin'
    refetchMock.mockClear()
    toastMock.mockReset()
    useClassPaymentsReportMock.mockImplementation(() => ({
      report: null,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: refetchMock,
    }))
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
    useClassPaymentsReportMock.mockReset()
  })

  it('keeps the report query manual until Generate Report is clicked', async () => {
    await act(async () => {
      root.render(<ClassPaymentsPage />)
    })

    const startDateInput = container.querySelector('#class-payments-start-date')
    const endDateInput = container.querySelector('#class-payments-end-date')
    const includePendingRadio = container.querySelector('#class-payments-status-include-pending')
    const includeZeroCheckbox = container.querySelector('#class-payments-include-zero')

    expect(startDateInput).toBeInstanceOf(HTMLInputElement)
    expect((startDateInput as HTMLInputElement).value).toBe('2026-03-12')
    expect(endDateInput).toBeInstanceOf(HTMLInputElement)
    expect((endDateInput as HTMLInputElement).value).toBe('2026-04-08')
    expect(useClassPaymentsReportMock).toHaveBeenNthCalledWith(1, '', '', 'approved', false)

    await setInputValue(startDateInput as HTMLInputElement, '2026-03-20')
    await setInputValue(endDateInput as HTMLInputElement, '2026-04-10')

    if (!(includePendingRadio instanceof HTMLInputElement)) {
      throw new Error('Include Pending radio not found.')
    }

    await setCheckboxChecked(includePendingRadio, true)

    if (!(includeZeroCheckbox instanceof HTMLInputElement)) {
      throw new Error('Include zero checkbox not found.')
    }

    await setCheckboxChecked(includeZeroCheckbox, true)

    expect(useClassPaymentsReportMock).toHaveBeenLastCalledWith('', '', 'approved', false)

    await clickButton(container, 'Generate Report')
    await flushAsyncWork()

    expect(useClassPaymentsReportMock).toHaveBeenLastCalledWith(
      '2026-03-20',
      '2026-04-10',
      'include-pending',
      true,
    )
    expect(refetchMock).toHaveBeenCalledTimes(1)
  })

  it('validates reversed date ranges before generating the report', async () => {
    await act(async () => {
      root.render(<ClassPaymentsPage />)
    })

    const startDateInput = container.querySelector('#class-payments-start-date')
    const endDateInput = container.querySelector('#class-payments-end-date')

    expect(startDateInput).toBeInstanceOf(HTMLInputElement)
    expect(endDateInput).toBeInstanceOf(HTMLInputElement)

    await setInputValue(startDateInput as HTMLInputElement, '2026-04-12')
    await setInputValue(endDateInput as HTMLInputElement, '2026-04-10')
    await clickButton(container, 'Generate Report')

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Invalid date range',
      }),
    )
    expect(useClassPaymentsReportMock).toHaveBeenLastCalledWith('', '', 'approved', false)
    expect(refetchMock).not.toHaveBeenCalled()
  })

  it('renders trainer sections, subtotals, and the grand total after generation', async () => {
    useClassPaymentsReportMock.mockImplementation(
      (
        startDate: string,
        endDate: string,
        status: string,
        includeZero: boolean,
      ) => ({
        report:
          startDate && endDate
            ? [
                {
                  trainerId: 'trainer-1',
                  trainerName: 'Jordan Trainer',
                  trainerTitles: ['Trainer'],
                  classes: [
                    {
                      classId: 'class-1',
                      className: 'Dance Cardio',
                      registrationCount: 4,
                      totalCollected: 20000,
                      compensationPct: 40,
                      trainerCount: 2,
                      payout: 4000,
                    },
                    {
                      classId: 'class-2',
                      className: 'Bootcamp',
                      registrationCount: includeZero ? 1 : 0,
                      totalCollected: includeZero ? 0 : 0,
                      compensationPct: 30,
                      trainerCount: 1,
                      payout: 0,
                    },
                  ],
                  totalPayout: 4000,
                },
                {
                  trainerId: 'trainer-2',
                  trainerName: 'Alex Coach',
                  trainerTitles: ['Coach', 'Medical'],
                  classes: [
                    {
                      classId: 'class-1',
                      className: 'Dance Cardio',
                      registrationCount: status === 'include-pending' ? 5 : 4,
                      totalCollected: status === 'include-pending' ? 25000 : 20000,
                      compensationPct: 40,
                      trainerCount: 2,
                      payout: status === 'include-pending' ? 5000 : 4000,
                    },
                  ],
                  totalPayout: status === 'include-pending' ? 5000 : 4000,
                },
              ]
            : null,
        isLoading: false,
        isFetching: false,
        error: null,
        refetch: refetchMock,
      }),
    )

    await act(async () => {
      root.render(<ClassPaymentsPage />)
    })

    await clickButton(container, 'Generate Report')
    await flushAsyncWork()

    expect(container.textContent).toContain('Download PDF')
    expect(container.textContent).toContain('Jordan Trainer')
    expect(container.textContent).toContain('Alex Coach')
    expect(container.textContent).toContain('Dance Cardio')
    expect(container.textContent).toContain('Bootcamp')
    expect(container.textContent).toContain('Trainer Subtotal Payout:')
    expect(container.textContent).toContain('Grand total payout')
    expect(container.textContent).toContain('$8,000')
  })

  it('redirects staff users to the trainer schedule', async () => {
    currentRoleState.role = 'staff'

    await act(async () => {
      root.render(<ClassPaymentsPage />)
    })

    expect(container.textContent).toContain('redirect:/trainer/schedule')
    expect(container.textContent).not.toContain('Group Class Payments')
  })
})
