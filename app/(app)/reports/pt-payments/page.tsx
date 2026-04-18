'use client'

import { useState } from 'react'
import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
import { BarChart3, Download, FileText } from 'lucide-react'
import { useProgressRouter } from '@/hooks/use-progress-router'
import { RoleGuard } from '@/components/role-guard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { StringDatePicker } from '@/components/ui/string-date-picker'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePtPaymentsReport } from '@/hooks/use-pt-scheduling'
import { toast } from '@/hooks/use-toast'
import {
  formatJmdCurrency,
  getCurrentMonthDateRangeInJamaica,
  JAMAICA_OFFSET,
  JAMAICA_TIME_ZONE,
  type PtPaymentsReport,
} from '@/lib/pt-scheduling'

function buildReturnTo(pathname: string | null, searchParams: ReadonlyURLSearchParams | null) {
  if (!pathname) {
    return null
  }

  const query = searchParams?.toString() ?? ''

  return query ? `${pathname}?${query}` : pathname
}

function formatAttendanceRate(value: number) {
  return `${value}%`
}

function formatReportDate(value: string) {
  const date = new Date(`${value}T00:00:00${JAMAICA_OFFSET}`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatGeneratedTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

async function downloadPtPaymentsPdf(
  report: PtPaymentsReport,
  startDate: string,
  endDate: string,
) {
  if (typeof window === 'undefined') {
    return
  }

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf/dist/jspdf.es.min.js'),
    import('jspdf-autotable/es'),
  ])
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
  })
  const leftMargin = 40
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  let cursorY = 48

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0, 0, 0)
  doc.text('Evolutionz Fitness — PT Trainer Payment Summary', leftMargin, cursorY)

  cursorY += 24
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(70, 70, 70)
  doc.text(`Period: ${formatReportDate(startDate)} to ${formatReportDate(endDate)}`, leftMargin, cursorY)

  cursorY += 16
  doc.text(`Generated: ${formatGeneratedTimestamp()}`, leftMargin, cursorY)

  autoTable(doc, {
    startY: cursorY + 20,
    margin: {
      left: leftMargin,
      right: leftMargin,
    },
    theme: 'grid',
    head: [['Total Assignments', 'Total Sessions Completed', 'Total Payout (JMD)']],
    body: [
      [
        String(report.summary.totalAssignments),
        String(report.summary.totalSessionsCompleted),
        formatJmdCurrency(report.summary.totalPayout),
      ],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 10,
      textColor: [0, 0, 0],
      lineColor: [190, 190, 190],
      lineWidth: 0.5,
      cellPadding: 6,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
  })

  cursorY = ((doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 28

  for (const trainer of report.trainers) {
    if (cursorY > pageHeight - 150) {
      doc.addPage()
      cursorY = 48
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(0, 0, 0)
    doc.text(trainer.trainerName, leftMargin, cursorY)

    cursorY += 15

    if (trainer.trainerTitles.length > 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(80, 80, 80)
      doc.text(trainer.trainerTitles.join(', '), leftMargin, cursorY)
      cursorY += 8
    }

    autoTable(doc, {
      startY: cursorY + 10,
      margin: {
        left: leftMargin,
        right: leftMargin,
      },
      theme: 'grid',
      head: [['Member', 'PT Fee', 'Sessions Completed', 'Sessions Missed', 'Attendance Rate']],
      body: trainer.clients.map((client) => [
        client.memberName,
        formatJmdCurrency(client.ptFee),
        String(client.sessionsCompleted),
        String(client.sessionsMissed),
        formatAttendanceRate(client.attendanceRate),
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 10,
        textColor: [0, 0, 0],
        lineColor: [190, 190, 190],
        lineWidth: 0.5,
        cellPadding: 6,
      },
      headStyles: {
        fillColor: [235, 235, 235],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
      },
    })

    cursorY = ((doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 18
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.text(`Monthly Payout: ${formatJmdCurrency(trainer.monthlyPayout)}`, leftMargin, cursorY)
    cursorY += 28
  }

  const pageCount = doc.getNumberOfPages()

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(90, 90, 90)
    doc.text('Evolutionz Fitness — Confidential', pageWidth / 2, pageHeight - 18, {
      align: 'center',
    })
  }

  doc.save(`pt-payments-${startDate}-to-${endDate}.pdf`)
}

function ReportsPageContent() {
  const router = useProgressRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const defaultDateRange = getCurrentMonthDateRangeInJamaica()
  const [draftStartDate, setDraftStartDate] = useState(defaultDateRange.startDate)
  const [draftEndDate, setDraftEndDate] = useState(defaultDateRange.endDate)
  const [submittedStartDate, setSubmittedStartDate] = useState('')
  const [submittedEndDate, setSubmittedEndDate] = useState('')
  const { report, isLoading, isFetching, error } = usePtPaymentsReport(
    submittedStartDate,
    submittedEndDate,
  )

  const handleGenerateReport = () => {
    if (!draftStartDate || !draftEndDate) {
      toast({
        title: 'Date range required',
        description: 'Choose a start date and end date before generating the report.',
        variant: 'destructive',
      })
      return
    }

    if (draftStartDate > draftEndDate) {
      toast({
        title: 'Invalid date range',
        description: 'Start date must be on or before end date.',
        variant: 'destructive',
      })
      return
    }

    setSubmittedStartDate(draftStartDate)
    setSubmittedEndDate(draftEndDate)
  }

  const handleDownloadPdf = async () => {
    if (!report || !submittedStartDate || !submittedEndDate) {
      return
    }

    try {
      await downloadPtPaymentsPdf(report, submittedStartDate, submittedEndDate)
    } catch (error) {
      toast({
        title: 'PDF export failed',
        description:
          error instanceof Error ? error.message : 'Failed to download the PT payments PDF.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Admin reporting for PT scheduling payments and trainer activity.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle>PT Trainer Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,220px)_auto]">
            <div className="space-y-2">
              <Label htmlFor="pt-payments-start-date">Start date</Label>
              <StringDatePicker
                id="pt-payments-start-date"
                value={draftStartDate}
                onChange={setDraftStartDate}
                maxValue={draftEndDate || undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pt-payments-end-date">End date</Label>
              <StringDatePicker
                id="pt-payments-end-date"
                value={draftEndDate}
                onChange={setDraftEndDate}
                minValue={draftStartDate || undefined}
              />
            </div>

            <div className="flex items-end gap-3">
              <Button onClick={handleGenerateReport} disabled={isFetching}>
                <FileText className="h-4 w-4" />
                {isFetching ? 'Generating...' : 'Generate Report'}
              </Button>
              {report ? (
                <Button variant="outline" onClick={() => void handleDownloadPdf()} disabled={isFetching}>
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
              ) : null}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                {Array.from({ length: 3 }, (_, index) => (
                  <Card key={`pt-payments-summary-skeleton-${index}`}>
                    <CardContent className="p-6">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="mt-3 h-8 w-24" />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="mt-4 h-48 w-full" />
                </CardContent>
              </Card>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : 'Failed to load the PT payments report.'}
              </p>
            </div>
          ) : report ? (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Total active trainer-client assignments
                    </p>
                    <p className="mt-2 text-3xl font-semibold">{report.summary.totalAssignments}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Total sessions completed</p>
                    <p className="mt-2 text-3xl font-semibold">
                      {report.summary.totalSessionsCompleted}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Total payout</p>
                    <p className="mt-2 text-3xl font-semibold">
                      {formatJmdCurrency(report.summary.totalPayout)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                Period: {formatReportDate(submittedStartDate)} to {formatReportDate(submittedEndDate)}
              </div>

              {report.trainers.length === 0 ? (
                <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                  No trainer assignments found for the selected period.
                </div>
              ) : (
                <div className="space-y-5">
                  {report.trainers.map((trainer) => (
                    <Card key={trainer.trainerId}>
                      <CardHeader className="space-y-3">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <CardTitle>{trainer.trainerName}</CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Active clients: {trainer.activeClients}
                            </p>
                          </div>
                          {trainer.trainerTitles.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {trainer.trainerTitles.map((title) => (
                                <Badge key={title} variant="outline">
                                  {title}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="overflow-x-auto rounded-lg border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Member Name</TableHead>
                                <TableHead>PT Fee (JMD)</TableHead>
                                <TableHead>Sessions Completed</TableHead>
                                <TableHead>Sessions Missed</TableHead>
                                <TableHead>Attendance Rate</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {trainer.clients.map((client) => (
                                <TableRow
                                  key={client.memberId}
                                  onClick={() => {
                                    const returnTo = buildReturnTo(pathname, searchParams)
                                    const href = returnTo
                                      ? `/members/${client.memberId}?returnTo=${encodeURIComponent(returnTo)}`
                                      : `/members/${client.memberId}`

                                    router.push(href)
                                  }}
                                  className="cursor-pointer hover:bg-muted/20"
                                >
                                  <TableCell className="font-medium">{client.memberName}</TableCell>
                                  <TableCell>{formatJmdCurrency(client.ptFee)}</TableCell>
                                  <TableCell>{client.sessionsCompleted}</TableCell>
                                  <TableCell>{client.sessionsMissed}</TableCell>
                                  <TableCell>{formatAttendanceRate(client.attendanceRate)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        <p className="text-base font-semibold">
                          Monthly Payout: {formatJmdCurrency(trainer.monthlyPayout)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
              Choose a date range and click Generate Report to load PT trainer payments.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function PtPaymentsPage() {
  return (
    <RoleGuard role="admin">
      <ReportsPageContent />
    </RoleGuard>
  )
}
