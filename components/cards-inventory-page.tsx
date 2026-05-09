'use client'

import { useQueryClient } from '@tanstack/react-query'
import { CreditCard, Plus } from 'lucide-react'
import { useState } from 'react'
import { AddAccessCardModal } from '@/components/add-access-card-modal'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { useCardInventory } from '@/hooks/use-card-inventory'
import { toast } from '@/hooks/use-toast'
import {
  createInventoryCard,
  decommissionInventoryCard,
} from '@/lib/card-inventory'
import { JAMAICA_TIME_ZONE } from '@/lib/jamaica-time'
import { queryKeys } from '@/lib/query-keys'
import type { CardInventoryItem } from '@/types'

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
    <Card>
      <CardHeader>
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  )
}

export function CardsInventoryPage() {
  const queryClient = useQueryClient()
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState<CardInventoryItem | null>(null)
  const [isDecommissioning, setIsDecommissioning] = useState(false)
  const { cards, isLoading, error } = useCardInventory()

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
            <h1 className="text-3xl font-bold tracking-tight">Cards</h1>
            <p className="text-muted-foreground">
              Manage the available access card inventory for member assignments.
            </p>
          </div>

          <Button type="button" onClick={() => setIsAddCardModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Card
          </Button>
        </div>

        {isLoading ? (
          <CardsInventoryLoadingState />
        ) : cards.length === 0 ? (
          <Empty className="rounded-2xl border bg-card py-16">
            <EmptyMedia variant="icon">
              <CreditCard className="size-5" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No available cards.</EmptyTitle>
              <EmptyDescription>
                Add a card to make it available for member assignment.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Available Cards</CardTitle>
              <CardDescription>
                These cards can be assigned to members and manually decommissioned if needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table size="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Card Number</TableHead>
                    <TableHead>Card Code</TableHead>
                    <TableHead>Date Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cards.map((card) => (
                    <TableRow key={card.cardNo}>
                      <TableCell className="font-medium">{card.cardNo}</TableCell>
                      <TableCell>{card.cardCode ?? '—'}</TableCell>
                      <TableCell>{formatCreatedAt(card.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setSelectedCard(card)}
                        >
                          Decommission
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
        title="Decommission card?"
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
