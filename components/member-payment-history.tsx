'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { BanknoteIcon, Mail, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { MemberPaymentReceiptPreviewDialog } from '@/components/member-payment-receipt-preview-dialog'
import { PaginationControls } from '@/components/pagination-controls'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMemberPayments } from '@/hooks/use-member-payments'
import { toast } from '@/hooks/use-toast'
import {
  deleteMemberPayment,
  getMemberPaymentTypeLabel,
  MEMBER_PAYMENTS_PAGE_SIZE,
} from '@/lib/member-payments'
import { queryKeys } from '@/lib/query-keys'
import {
  formatPaymentMethodLabel,
  formatRevenueCurrency,
  formatRevenueReportDate,
  formatRevenueReportDateTime,
} from '@/lib/revenue-reports'
import type { MemberPaymentHistoryItem } from '@/types'

type MemberPaymentHistoryProps = {
  memberId: string
  memberEmail?: string | null
}

function formatOptionalText(value: string | null) {
  return value && value.trim() ? value.trim() : '-'
}

function getReceiptDisabledReason(
  payment: MemberPaymentHistoryItem,
  memberEmail: string | null | undefined,
) {
  if (!payment.receiptNumber) {
    return 'Receipts are unavailable for this historical payment.'
  }

  if (!memberEmail?.trim()) {
    return 'Add an email address to the member profile before sending a receipt.'
  }

  if (payment.receiptSentAt) {
    return 'This receipt has already been sent.'
  }

  return null
}

export function MemberPaymentHistory({ memberId, memberEmail = null }: MemberPaymentHistoryProps) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [paymentToDelete, setPaymentToDelete] = useState<MemberPaymentHistoryItem | null>(null)
  const [receiptPayment, setReceiptPayment] = useState<MemberPaymentHistoryItem | null>(null)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)
  const { data, isLoading, error, refetch } = useMemberPayments(memberId, page)

  useEffect(() => {
    setPage(0)
    setPaymentToDelete(null)
    setReceiptPayment(null)
  }, [memberId])

  const payments = data?.payments ?? []
  const totalMatches = data?.totalMatches ?? 0
  const totalPages = Math.max(1, Math.ceil(totalMatches / MEMBER_PAYMENTS_PAGE_SIZE))
  const showPagination = totalMatches > MEMBER_PAYMENTS_PAGE_SIZE
  const rangeStart = totalMatches === 0 ? 0 : page * MEMBER_PAYMENTS_PAGE_SIZE + 1
  const rangeEnd = Math.min((page + 1) * MEMBER_PAYMENTS_PAGE_SIZE, totalMatches)

  const handleDeletePayment = async () => {
    if (!paymentToDelete) {
      return
    }

    setDeletingPaymentId(paymentToDelete.id)

    try {
      await deleteMemberPayment(memberId, paymentToDelete.id)

      if (page > 0 && payments.length === 1) {
        setPage((currentPage) => Math.max(currentPage - 1, 0))
      }

      setPaymentToDelete(null)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.memberPayments.member(memberId),
      })
      toast({
        title: 'Payment deleted',
      })
    } catch (deleteError) {
      toast({
        title: 'Delete failed',
        description:
          deleteError instanceof Error
            ? deleteError.message
            : 'Failed to delete the member payment.',
        variant: 'destructive',
      })
    } finally {
      setDeletingPaymentId(null)
    }
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <BanknoteIcon className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">
              {error.message || 'Failed to load member payments.'}
            </p>
            <Button variant="outline" className="w-fit" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <BanknoteIcon className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-[1240px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Payment Type</TableHead>
                  <TableHead className="text-right">Amount (JMD)</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Promotion</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Receipt Number</TableHead>
                  <TableHead>Recorded By</TableHead>
                  <TableHead>Recorded At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }, (_, index) => (
                    <TableRow key={`member-payment-skeleton-${index}`}>
                      <TableCell>
                        <Skeleton className="h-5 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="ml-auto h-5 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="ml-auto h-9 w-32" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-16 text-center text-muted-foreground">
                      No payment history recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((payment) => {
                    const receiptDisabledReason = getReceiptDisabledReason(payment, memberEmail)

                    return (
                      <TableRow key={payment.id}>
                        <TableCell>{formatRevenueReportDate(payment.paymentDate)}</TableCell>
                        <TableCell>
                          {getMemberPaymentTypeLabel(payment.paymentType, payment.memberTypeName)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatRevenueCurrency(payment.amountPaid)}
                        </TableCell>
                        <TableCell>{formatPaymentMethodLabel(payment.paymentMethod)}</TableCell>
                        <TableCell>{formatOptionalText(payment.promotion)}</TableCell>
                        <TableCell>{formatOptionalText(payment.notes)}</TableCell>
                        <TableCell>{payment.receiptNumber ?? '-'}</TableCell>
                        <TableCell>{payment.recordedByName ?? 'Unknown'}</TableCell>
                        <TableCell>{formatRevenueReportDateTime(payment.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="ml-auto flex justify-end gap-2">
                            {receiptDisabledReason ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex">
                                    <Button type="button" size="sm" variant="outline" disabled>
                                      <Mail className="h-4 w-4" />
                                      Send Receipt
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{receiptDisabledReason}</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setReceiptPayment(payment)}
                              >
                                <Mail className="h-4 w-4" />
                                Send Receipt
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="ml-auto"
                              onClick={() => setPaymentToDelete(payment)}
                              loading={deletingPaymentId === payment.id}
                              disabled={deletingPaymentId === payment.id}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {showPagination ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Showing {rangeStart}-{rangeEnd} of {totalMatches}
              </p>
              <PaginationControls
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={paymentToDelete !== null}
        title="Delete payment?"
        description={
          paymentToDelete
            ? `Delete the ${formatRevenueCurrency(paymentToDelete.amountPaid)} payment recorded on ${formatRevenueReportDate(paymentToDelete.paymentDate)}? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete Payment"
        cancelLabel="Cancel"
        onConfirm={() => void handleDeletePayment()}
        onCancel={() => setPaymentToDelete(null)}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentToDelete(null)
          }
        }}
        isLoading={deletingPaymentId === paymentToDelete?.id}
        variant="destructive"
      />

      <MemberPaymentReceiptPreviewDialog
        memberId={memberId}
        paymentId={receiptPayment?.id ?? null}
        open={receiptPayment !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReceiptPayment(null)
          }
        }}
        onSent={() => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.memberPayments.member(memberId),
          })
        }}
      />
    </>
  )
}
