'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AddAccessCardModal } from '@/components/add-access-card-modal'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PaginationControls } from '@/components/pagination-controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCardInventory } from '@/hooks/use-card-inventory'
import { toast } from '@/hooks/use-toast'
import { createInventoryCard, decommissionInventoryCard } from '@/lib/card-inventory'
import { JAMAICA_TIME_ZONE } from '@/lib/jamaica-time'
import { queryKeys } from '@/lib/query-keys'
import type { CardInventoryItem } from '@/types'

const PAGE_SIZE_OPTIONS = ['10', '25', '50'] as const
const DEFAULT_PAGE_SIZE = Number(PAGE_SIZE_OPTIONS[0])

function formatCreatedAt(value: string) {
  const parsedValue = new Date(value)

  if (Number.isNaN(parsedValue.getTime())) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsedValue)
}

function CardsInventoryLoadingState() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-10 min-w-[200px] max-w-sm flex-1" />
      </div>
      <div className="overflow-hidden rounded-lg border bg-background">
        <div className="border-b bg-muted/40 px-4 py-4">
          <Skeleton className="h-5 w-full" />
        </div>
        <div className="space-y-4 px-4 py-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  )
}

export function CardsInventoryPage() {
  const queryClient = useQueryClient()
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState<CardInventoryItem | null>(null)
  const [isDecommissioning, setIsDecommissioning] = useState(false)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [currentPage, setCurrentPage] = useState(0)
  const { cards, isLoading, error } = useCardInventory()
  const normalizedSearch = search.trim().toLowerCase()
  const filteredCards = normalizedSearch
    ? cards.filter((card) => {
        const normalizedCardNo = card.cardNo.toLowerCase()
        const normalizedCardCode = (card.cardCode ?? '').toLowerCase()

        return (
          normalizedCardNo.includes(normalizedSearch) || normalizedCardCode.includes(normalizedSearch)
        )
      })
    : cards
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / pageSize))
  const paginatedCards = filteredCards.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  useEffect(() => {
    if (currentPage > totalPages - 1) {
      setCurrentPage(totalPages - 1)
    }
  }, [currentPage, totalPages])

  const handleAddCardSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.cards.inventory })
  }

  const handleDecommission = async () => {
    if (!selectedCard) {
      return
    }

    const card = selectedCard
    setIsDecommissioning(true)

    try {
      await decommissionInventoryCard(card.cardNo)
      setSelectedCard(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.cards.inventory }),
        queryClient.invalidateQueries({ queryKey: queryKeys.cards.available }),
      ])
      toast({
        title: 'Card decommissioned',
        description: `${card.cardNo} is no longer assignable.`,
      })
    } catch (error) {
      console.error('Failed to decommission card:', error)
      toast({
        title: 'Decommission failed',
        description:
          error instanceof Error ? error.message : 'Failed to decommission the access card.',
        variant: 'destructive',
      })
    } finally {
      setIsDecommissioning(false)
    }
  }

  if (error) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Available Cards</h1>
            <p className="text-muted-foreground">
              These cards can be assigned to members and manually decommissioned if needed.
            </p>
          </div>

          <Button
            type="button"
            onClick={() => setIsAddCardModalOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Card
          </Button>
        </div>

        {isLoading ? (
          <CardsInventoryLoadingState />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by card number or card code..."
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setCurrentPage(0)
                  }}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border bg-background">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="border-b hover:bg-muted/40">
                    <TableHead className="h-14 px-4 text-sm font-semibold">Card Number</TableHead>
                    <TableHead className="h-14 px-4 text-sm font-semibold">Card Code</TableHead>
                    <TableHead className="h-14 px-4 text-sm font-semibold">Date Added</TableHead>
                    <TableHead className="h-14 px-4 text-right text-sm font-semibold">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cards.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 px-4 text-center text-muted-foreground">
                        No available cards.
                      </TableCell>
                    </TableRow>
                  ) : filteredCards.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 px-4 text-center text-muted-foreground">
                        No cards match your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedCards.map((card) => (
                      <TableRow key={card.cardNo} className="hover:bg-muted/20">
                        <TableCell className="px-4 py-4 font-medium">{card.cardNo}</TableCell>
                        <TableCell className="px-4 py-4">{card.cardCode ?? '—'}</TableCell>
                        <TableCell className="px-4 py-4">{formatCreatedAt(card.createdAt)}</TableCell>
                        <TableCell className="px-4 py-4 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSelectedCard(card)}
                          >
                            Decommission
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {filteredCards.length > 0 ? (
                <div className="flex flex-col gap-4 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {filteredCards.length} {filteredCards.length === 1 ? 'Row' : 'Rows'}
                  </p>

                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">Rows per page</span>
                      <Select
                        value={String(pageSize)}
                        onValueChange={(value) => {
                          setPageSize(Number(value))
                          setCurrentPage(0)
                        }}
                      >
                        <SelectTrigger className="h-9 w-[92px] rounded-md bg-background text-sm shadow-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <p className="text-sm font-medium">
                      Page {currentPage + 1} of {totalPages}
                    </p>
                    <PaginationControls
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      <AddAccessCardModal
        open={isAddCardModalOpen}
        onOpenChange={setIsAddCardModalOpen}
        onSuccess={handleAddCardSuccess}
        createCardAction={createInventoryCard}
      />

      <ConfirmDialog
        open={selectedCard !== null}
        title={
          selectedCard
            ? `Decommission card ${selectedCard.cardCode ?? selectedCard.cardNo}?`
            : 'Decommission card?'
        }
        description="This card will be permanently marked as decommissioned and cannot be assigned to any member."
        confirmLabel="Decommission"
        variant="destructive"
        isLoading={isDecommissioning}
        onConfirm={() => void handleDecommission()}
        onCancel={() => setSelectedCard(null)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCard(null)
          }
        }}
      />
    </>
  )
}
