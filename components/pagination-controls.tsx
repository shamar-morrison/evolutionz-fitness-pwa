'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

type PaginationControlsProps = {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(page, 0), Math.max(totalPages - 1, 0))
}

export function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationControlsProps) {
  const lastPage = Math.max(totalPages - 1, 0)
  const isFirstPage = currentPage <= 0
  const isLastPage = currentPage >= lastPage

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-md shadow-none"
        onClick={() => onPageChange(0)}
        disabled={isFirstPage}
        aria-label="Go to first page"
      >
        <ChevronsLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-md shadow-none"
        onClick={() => onPageChange(clampPage(currentPage - 1, totalPages))}
        disabled={isFirstPage}
        aria-label="Go to previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-md shadow-none"
        onClick={() => onPageChange(clampPage(currentPage + 1, totalPages))}
        disabled={isLastPage}
        aria-label="Go to next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-md shadow-none"
        onClick={() => onPageChange(lastPage)}
        disabled={isLastPage}
        aria-label="Go to last page"
      >
        <ChevronsRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
