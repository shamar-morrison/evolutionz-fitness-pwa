'use client'

import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RedirectOnMount } from '@/components/redirect-on-mount'
import { RoleGuard } from '@/components/role-guard'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { useMemberTypes } from '@/hooks/use-member-types'
import { toast } from '@/hooks/use-toast'
import { formatMemberTypeRate, updateMemberTypeRate } from '@/lib/member-types'
import { queryKeys } from '@/lib/query-keys'
import type { MemberTypeRecord } from '@/types'

export default function SettingsPage() {
  return (
    <RoleGuard role="admin" fallback={<RedirectOnMount href="/trainer/schedule" />}>
      <SettingsPageContent />
    </RoleGuard>
  )
}

function SettingsPageContent() {
  const queryClient = useQueryClient()
  const { memberTypes, isLoading, error } = useMemberTypes()
  const [editingMemberType, setEditingMemberType] = useState<MemberTypeRecord | null>(null)
  const [monthlyRateInput, setMonthlyRateInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleEditClick = (memberType: MemberTypeRecord) => {
    setEditingMemberType(memberType)
    setMonthlyRateInput(String(memberType.monthly_rate))
  }

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && !isSaving) {
      setEditingMemberType(null)
      setMonthlyRateInput('')
    }
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!editingMemberType) {
      return
    }

    const parsedRate = Number(monthlyRateInput)

    if (!Number.isFinite(parsedRate) || parsedRate <= 0 || !Number.isInteger(parsedRate)) {
      toast({
        title: 'Invalid rate',
        description: 'Enter a whole-number monthly rate in JMD.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)

    try {
      await updateMemberTypeRate(editingMemberType.id, {
        monthly_rate: parsedRate,
      })

      await queryClient.invalidateQueries({ queryKey: queryKeys.memberTypes.all })

      toast({
        title: 'Rate updated',
        description: `${editingMemberType.name} now uses ${formatMemberTypeRate(parsedRate)}.`,
      })

      setEditingMemberType(null)
      setMonthlyRateInput('')
    } catch (saveError) {
      toast({
        title: 'Update failed',
        description:
          saveError instanceof Error
            ? saveError.message
            : 'Unable to update the membership type rate.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Membership Types</CardTitle>
          <CardDescription>
            Configure monthly rates for each membership type. Rates apply to new payments going
            forward.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-3 px-6">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="px-6">
              <p className="text-sm text-destructive">
                {error instanceof Error
                  ? error.message
                  : 'Failed to load membership types.'}
              </p>
            </div>
          ) : memberTypes.length === 0 ? (
            <div className="px-6">
              <p className="text-sm text-muted-foreground">No membership types found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type name</TableHead>
                  <TableHead>Monthly rate</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberTypes.map((memberType) => (
                  <TableRow key={memberType.id}>
                    <TableCell className="font-medium">{memberType.name}</TableCell>
                    <TableCell>{formatMemberTypeRate(memberType.monthly_rate)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditClick(memberType)}
                        >
                          Edit Rate
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingMemberType)} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md" isLoading={isSaving}>
          <form className="space-y-4" onSubmit={(event) => void handleSave(event)}>
            <DialogHeader>
              <DialogTitle>{editingMemberType?.name ?? 'Edit Rate'}</DialogTitle>
              <DialogDescription>Update the monthly rate in JMD.</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="member-type-monthly-rate">Monthly rate (JMD)</Label>
              <Input
                id="member-type-monthly-rate"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={monthlyRateInput}
                onChange={(event) => setMonthlyRateInput(event.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" loading={isSaving}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
