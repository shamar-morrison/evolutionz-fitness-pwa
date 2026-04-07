import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeNavigationProgress,
  isNavigationInFlight,
  startNavigationProgress,
  subscribeNavigationProgress,
  type NavigationProgressState,
} from '@/lib/navigation-progress'

describe('navigation progress controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    completeNavigationProgress()
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it('starts visible progress and trickles forward while navigation is active', () => {
    const snapshots: NavigationProgressState[] = []
    const unsubscribe = subscribeNavigationProgress((value) => {
      snapshots.push(value)
    })

    startNavigationProgress()

    expect(isNavigationInFlight()).toBe(true)
    expect(snapshots.at(-1)).toMatchObject({
      active: true,
      fadingOut: false,
      progress: 0.12,
      visible: true,
    })

    vi.advanceTimersByTime(140)

    expect(snapshots.at(-1)?.progress).toBeGreaterThan(0.12)
    expect(snapshots.at(-1)?.progress).toBeLessThanOrEqual(0.9)

    unsubscribe()
  })

  it('completes the bar, fades it out, and resets the hidden state', () => {
    const snapshots: NavigationProgressState[] = []
    const unsubscribe = subscribeNavigationProgress((value) => {
      snapshots.push(value)
    })

    startNavigationProgress()
    completeNavigationProgress()

    expect(isNavigationInFlight()).toBe(false)
    expect(snapshots.at(-1)).toMatchObject({
      active: false,
      fadingOut: false,
      progress: 1,
      visible: true,
    })

    vi.advanceTimersByTime(120)

    expect(snapshots.at(-1)).toMatchObject({
      active: false,
      fadingOut: true,
      progress: 1,
      visible: true,
    })

    vi.advanceTimersByTime(180)

    expect(snapshots.at(-1)).toMatchObject({
      active: false,
      fadingOut: false,
      progress: 0,
      visible: false,
    })

    unsubscribe()
  })
})
