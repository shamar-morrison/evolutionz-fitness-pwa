export type NavigationProgressState = {
  active: boolean
  fadingOut: boolean
  progress: number
  visible: boolean
}

const INITIAL_PROGRESS = 0.12
const TRICKLE_INTERVAL_MS = 140
const COMPLETE_TO_FADE_DELAY_MS = 120
const RESET_DELAY_MS = 300
const MAX_PROGRESS = 0.9

const initialState: NavigationProgressState = {
  active: false,
  fadingOut: false,
  progress: 0,
  visible: false,
}

let state: NavigationProgressState = initialState
let trickleTimer: ReturnType<typeof setInterval> | null = null
let fadeTimer: ReturnType<typeof setTimeout> | null = null
let resetTimer: ReturnType<typeof setTimeout> | null = null

const subscribers = new Set<(value: NavigationProgressState) => void>()

function emit() {
  for (const subscriber of subscribers) {
    subscriber(state)
  }
}

function setState(nextState: NavigationProgressState) {
  state = nextState
  emit()
}

function clearTrickleTimer() {
  if (!trickleTimer) {
    return
  }

  clearInterval(trickleTimer)
  trickleTimer = null
}

function clearTransitionTimers() {
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }

  if (resetTimer) {
    clearTimeout(resetTimer)
    resetTimer = null
  }
}

function getNextProgress(progress: number) {
  if (progress >= MAX_PROGRESS) {
    return MAX_PROGRESS
  }

  const increment =
    progress < 0.25 ? 0.14 : progress < 0.45 ? 0.1 : progress < 0.65 ? 0.06 : progress < 0.8 ? 0.03 : 0.015

  return Math.min(MAX_PROGRESS, Number((progress + increment).toFixed(3)))
}

function startTrickle() {
  if (trickleTimer) {
    return
  }

  trickleTimer = setInterval(() => {
    if (!state.active) {
      return
    }

    const nextProgress = getNextProgress(state.progress)

    if (nextProgress === state.progress) {
      return
    }

    setState({
      ...state,
      progress: nextProgress,
    })
  }, TRICKLE_INTERVAL_MS)
}

export function subscribeNavigationProgress(
  subscriber: (value: NavigationProgressState) => void,
) {
  subscribers.add(subscriber)
  subscriber(state)

  return () => {
    subscribers.delete(subscriber)
  }
}

export function startNavigationProgress() {
  clearTransitionTimers()

  if (state.active) {
    startTrickle()
    return
  }

  setState({
    active: true,
    fadingOut: false,
    progress: INITIAL_PROGRESS,
    visible: true,
  })

  startTrickle()
}

export function completeNavigationProgress() {
  if (!state.active && !state.visible) {
    return
  }

  clearTrickleTimer()
  clearTransitionTimers()

  setState({
    active: false,
    fadingOut: false,
    progress: 1,
    visible: true,
  })

  fadeTimer = setTimeout(() => {
    setState({
      ...state,
      fadingOut: true,
    })
  }, COMPLETE_TO_FADE_DELAY_MS)

  resetTimer = setTimeout(() => {
    clearTransitionTimers()
    setState(initialState)
  }, RESET_DELAY_MS)
}

export function isNavigationInFlight() {
  return state.active
}
