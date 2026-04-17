'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Download, FileText } from 'lucide-react'
import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { RoleGuard } from '@/components/role-guard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
import { useClassPaymentsReport } from '@/hooks/use-classes'
import { toast } from '@/hooks/use-toast'
import {
  CLASS_PAYMENTS_REPORT_STATUSES,
  getCurrent28DayDateRangeInJamaica,
  type ClassPaymentsReportStatus,
  type ClassPaymentsReportTrainer,
} from '@/lib/classes'
import {
  formatJmdCurrency,
  JAMAICA_OFFSET,
  JAMAICA_TIME_ZONE,
} from '@/lib/pt-scheduling'

type ReportFilters = {
  startDate: string
  endDate: string
  status: ClassPaymentsReportStatus
  includeZero: boolean
}

const APPROVED_ONLY_STATUS: ClassPaymentsReportStatus = 'approved'

function isClassPaymentsReportStatus(value: string): value is ClassPaymentsReportStatus {
  return (CLASS_PAYMENTS_REPORT_STATUSES as readonly string[]).includes(value)
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

function formatCompensationPct(value: number) {
  return `${value.toFixed(2).replace(/\.?0+$/u, '')}%`
}

function getStatusLabel(status: ClassPaymentsReportStatus) {
  return status === 'approved' ? 'Approved only' : 'Include Pending'
}

function areFiltersEqual(left: ReportFilters | null, right: ReportFilters) {
  return (
    left?.startDate === right.startDate &&
    left?.endDate === right.endDate &&
    left?.status === right.status &&
    left?.includeZero === right.includeZero
  )
}

function getGrandTotalPayout(report: ClassPaymentsReportTrainer[]) {
  return report.reduce((total, trainer) => total + trainer.totalPayout, 0)
}

async function downloadClassPaymentsPdf(
  report: ClassPaymentsReportTrainer[],
  filters: ReportFilters,
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
  const footerLines = [
    `Generated: ${formatGeneratedTimestamp()}`,
    `Period: ${formatReportDate(filters.startDate)} to ${formatReportDate(filters.endDate)} | Status: ${getStatusLabel(filters.status)} | Include $0: ${filters.includeZero ? 'Yes' : 'No'}`,
  ]
  let cursorY = 48

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0, 0, 0)
  doc.text('Evolutionz Fitness — Group Class Payment Summary', leftMargin, cursorY)

  cursorY += 24
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(70, 70, 70)
  doc.text(`Period: ${formatReportDate(filters.startDate)} to ${formatReportDate(filters.endDate)}`, leftMargin, cursorY)

  cursorY += 16
  doc.text(`Status: ${getStatusLabel(filters.status)}`, leftMargin, cursorY)

  cursorY += 16
  doc.text(`Include $0 registrations: ${filters.includeZero ? 'Yes' : 'No'}`, leftMargin, cursorY)

  cursorY += 16
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(0, 0, 0)
  doc.text(`Grand Total Payout: ${formatJmdCurrency(getGrandTotalPayout(report))}`, leftMargin, cursorY)

  cursorY += 28

  if (report.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(90, 90, 90)
    doc.text('No trainer payouts found for the selected filters.', leftMargin, cursorY)
  }

  for (const trainer of report) {
    if (cursorY > pageHeight - 170) {
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
      head: [['Class', 'Registrations', 'Total Collected', 'Compensation %', 'Payout']],
      body: trainer.classes.map((classItem) => [
        classItem.className,
        String(classItem.registrationCount),
        formatJmdCurrency(classItem.totalCollected),
        formatCompensationPct(classItem.compensationPct),
        formatJmdCurrency(classItem.payout),
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
    doc.text(`Trainer Subtotal: ${formatJmdCurrency(trainer.totalPayout)}`, leftMargin, cursorY)
    cursorY += 28
  }

  const pageCount = doc.getNumberOfPages()

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(90, 90, 90)
    doc.text(footerLines[0], pageWidth / 2, pageHeight - 30, {
      align: 'center',
    })
    doc.text(footerLines[1], pageWidth / 2, pageHeight - 18, {
      align: 'center',
    })
  }

  doc.save(`class-payments-${filters.startDate}-to-${filters.endDate}.pdf`)
}

function ClassPaymentsReportPageContent() {
  const defaultDateRange = getCurrent28DayDateRangeInJamaica()
  const [draftStartDate, setDraftStartDate] = useState(defaultDateRange.startDate)
  const [draftEndDate, setDraftEndDate] = useState(defaultDateRange.endDate)
  const [draftStatus, setDraftStatus] = useState<ClassPaymentsReportStatus>(APPROVED_ONLY_STATUS)
  const [draftIncludeZero, setDraftIncludeZero] = useState(false)
  const [generatedFilters, setGeneratedFilters] = useState<ReportFilters | null>(null)
  const [shouldFetchGeneratedFilters, setShouldFetchGeneratedFilters] = useState(false)
  const { report, isLoading, isFetching, error, refetch } = useClassPaymentsReport(
    generatedFilters?.startDate ?? '',
    generatedFilters?.endDate ?? '',
    generatedFilters?.status ?? APPROVED_ONLY_STATUS,
    generatedFilters?.includeZero ?? false,
  )

  useEffect(() => {
    if (!shouldFetchGeneratedFilters || !generatedFilters) {
      return
    }

    setShouldFetchGeneratedFilters(false)
    void refetch()
  }, [generatedFilters, refetch, shouldFetchGeneratedFilters])

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

    const nextFilters: ReportFilters = {
      startDate: draftStartDate,
      endDate: draftEndDate,
      status: draftStatus,
      includeZero: draftIncludeZero,
    }

    if (areFiltersEqual(generatedFilters, nextFilters)) {
      void refetch()
      return
    }

    setGeneratedFilters(nextFilters)
    setShouldFetchGeneratedFilters(true)
  }

  const handleDownloadPdf = async () => {
    if (!report || !generatedFilters) {
      return
    }

    try {
      await downloadClassPaymentsPdf(report, generatedFilters)
    } catch (error) {
      toast({
        title: 'PDF export failed',
        description:
          error instanceof Error ? error.message : 'Failed to download the class payments PDF.',
        variant: 'destructive',
      })
    }
  }

  const grandTotalPayout = report ? getGrandTotalPayout(report) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Admin reporting for trainer compensation across group class registrations.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Group Class Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto_auto]">
            <div className="space-y-2">
              <Label htmlFor="class-payments-start-date">Start date</Label>
              <StringDatePicker
                id="class-payments-start-date"
                value={draftStartDate}
                onChange={setDraftStartDate}
                maxValue={draftEndDate || undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="class-payments-end-date">End date</Label>
              <StringDatePicker
                id="class-payments-end-date"
                value={draftEndDate}
                onChange={setDraftEndDate}
                minValue={draftStartDate || undefined}
              />
            </div>

            <div className="space-y-2">
              <Label>Registration status</Label>
              <RadioGroup
                className="flex flex-col gap-2 sm:flex-row sm:items-center"
                value={draftStatus}
                onValueChange={(value) => {
                  if (isClassPaymentsReportStatus(value)) {
                    setDraftStatus(value)
                  }
                }}
              >
                <div className="flex flex-1 items-center gap-2 rounded-md border p-3">
                  <RadioGroupItem value="approved" id="class-payments-status-approved" />
                  <Label htmlFor="class-payments-status-approved" className="whitespace-nowrap">Approved only</Label>
                </div>
                <div className="flex flex-1 items-center gap-2 rounded-md border p-3">
                  <RadioGroupItem
                    value="include-pending"
                    id="class-payments-status-include-pending"
                  />
                  <Label htmlFor="class-payments-status-include-pending" className="whitespace-nowrap">Include Pending</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex items-end">
              <div className="flex items-center gap-3 rounded-md border px-4 py-3">
                <Checkbox
                  id="class-payments-include-zero"
                  checked={draftIncludeZero}
                  onCheckedChange={(checked) => setDraftIncludeZero(checked === true)}
                />
                <Label htmlFor="class-payments-include-zero" className="whitespace-nowrap">Include $0 registrations</Label>
              </div>
            </div>

          </div>

          <div className="flex items-center gap-3">
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

          {isLoading ? (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="mt-4 h-48 w-full" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-44" />
                  <Skeleton className="mt-4 h-56 w-full" />
                </CardContent>
              </Card>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : 'Failed to load the class payments report.'}
              </p>
            </div>
          ) : report ? (
            <div className="space-y-6">
              {generatedFilters ? (
                <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  Period: {formatReportDate(generatedFilters.startDate)} to{' '}
                  {formatReportDate(generatedFilters.endDate)} | Status:{' '}
                  {getStatusLabel(generatedFilters.status)} | Include $0 registrations:{' '}
                  {generatedFilters.includeZero ? 'Yes' : 'No'}
                </div>
              ) : null}

              {report.length === 0 ? (
                <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                  No trainer payouts found for the selected filters.
                </div>
              ) : (
                <div className="space-y-5">
                  {report.map((trainer) => (
                    <Card key={trainer.trainerId}>
                      <CardHeader className="space-y-3">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <CardTitle>{trainer.trainerName}</CardTitle>
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
                                <TableHead>Class name</TableHead>
                                <TableHead>Registrations count</TableHead>
                                <TableHead>Total collected</TableHead>
                                <TableHead>Compensation %</TableHead>
                                <TableHead>Payout</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {trainer.classes.map((classItem) => (
                                <TableRow key={classItem.classId}>
                                  <TableCell className="font-medium">{classItem.className}</TableCell>
                                  <TableCell>{classItem.registrationCount}</TableCell>
                                  <TableCell>{formatJmdCurrency(classItem.totalCollected)}</TableCell>
                                  <TableCell>{formatCompensationPct(classItem.compensationPct)}</TableCell>
                                  <TableCell>{formatJmdCurrency(classItem.payout)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        <p className="text-base font-semibold">
                          Trainer Subtotal Payout: {formatJmdCurrency(trainer.totalPayout)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <div className="rounded-lg border bg-muted/20 px-4 py-4">
                <p className="text-sm text-muted-foreground">Grand total payout</p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatJmdCurrency(grandTotalPayout)}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
              Choose your filters and click Generate Report to load class trainer payments.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function ClassPaymentsPage() {
  return (
    <RoleGuard role="admin" fallback={<AuthenticatedHomeRedirect />}>
      <ClassPaymentsReportPageContent />
    </RoleGuard>
  )
}
