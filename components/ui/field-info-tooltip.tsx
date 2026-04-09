'use client'

import { useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type FieldInfoTooltipProps = {
  content: ReactNode
  label: string
}

export function FieldInfoTooltip({ content, label }: FieldInfoTooltipProps) {
  const [open, setOpen] = useState(false)

  const handleFocus = (event: FocusEvent<HTMLButtonElement>) => {
    if (event.currentTarget.matches(':focus-visible')) {
      setOpen(true)
    }
  }

  const handleBlur = () => {
    setOpen(false)
  }

  const handlePointerEnter = () => {
    setOpen(true)
  }

  const handlePointerLeave = () => {
    setOpen(false)
  }

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'mouse') {
      setOpen((currentOpen) => !currentOpen)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <Tooltip open={open}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
          className="inline-flex size-4 items-center justify-center rounded-full border border-muted-foreground/35 text-[10px] font-medium leading-none text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          i
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="text-pretty">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
