'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { Bold, Italic, List, ListOrdered, Paperclip, UnderlineIcon, X, Send, Users, PenLine } from 'lucide-react'
import { useMemo, useState, useRef, type ChangeEvent } from 'react'
import {
  ADMIN_EMAIL_ATTACHMENT_MAX_BYTES,
  dedupeRecipientsByEmail,
  hasMeaningfulHtmlContent,
  resolveDraftEmailRecipients,
  toEmailRecipient,
  type EmailRecipient,
  type EmailRecipientWithId,
} from '@/lib/admin-email'
import { SearchableSelect, type SearchableSelectOption } from '@/components/searchable-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Toggle } from '@/components/ui/toggle'
import { useMemberTypes } from '@/hooks/use-member-types'
import { useMembers } from '@/hooks/use-members'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type EmailClientProps = {
  resendDailyLimit: number
}

type ErrorResponse = {
  ok?: false
  error: string
}

type RecipientsSuccessResponse = {
  ok: true
  recipients: EmailRecipientWithId[]
}

type SendSuccessResponse = {
  ok: true
  sentCount: number
  alreadySentCount: number
  skippedDueToQuotaCount: number
}

function formatAttachmentSize(size: number) {
  const sizeInMegabytes = size / (1024 * 1024)
  return `${sizeInMegabytes.toFixed(sizeInMegabytes >= 10 ? 0 : 1)} MB`
}

function formatRecipientLabel(count: number) {
  return `${count} recipient${count === 1 ? '' : 's'}`
}

function createIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  throw new Error('Unable to generate an email send key.')
}

function getSendSuccessToast(input: SendSuccessResponse) {
  const descriptionParts: string[] = []

  if (input.sentCount > 0) {
    descriptionParts.push(`Sent to ${formatRecipientLabel(input.sentCount)}.`)
  }

  if (input.alreadySentCount > 0) {
    descriptionParts.push(
      `${formatRecipientLabel(input.alreadySentCount)} already sent for this draft.`,
    )
  }

  if (input.skippedDueToQuotaCount > 0) {
    descriptionParts.push(
      `${formatRecipientLabel(input.skippedDueToQuotaCount)} skipped because the daily limit was reached.`,
    )
  }

  if (descriptionParts.length === 0) {
    descriptionParts.push('No new emails were sent.')
  }

  let title = 'Email sent'

  if (input.sentCount === 0) {
    title = 'No new emails sent'
  } else if (input.skippedDueToQuotaCount > 0) {
    title = 'Email partially sent'
  }

  return {
    title,
    description: descriptionParts.join(' '),
  }
}

function getResponseErrorMessage(responseBody: unknown, fallback: string) {
  if (
    responseBody &&
    typeof responseBody === 'object' &&
    'error' in responseBody &&
    typeof responseBody.error === 'string'
  ) {
    return responseBody.error
  }

  return fallback
}

function buildRecipientsLookupUrl(input: {
  activeMembers: boolean
  expiringMembers: boolean
  expiredMembers: boolean
  memberTypeIds: string[]
  individualIds: string[]
}) {
  const searchParams = new URLSearchParams()

  if (input.activeMembers) {
    searchParams.set('activeMembers', 'true')
  }

  if (input.expiringMembers) {
    searchParams.set('expiringMembers', 'true')
  }

  if (input.expiredMembers) {
    searchParams.set('expiredMembers', 'true')
  }

  if (input.memberTypeIds.length > 0) {
    searchParams.set('memberTypeIds', input.memberTypeIds.join(','))
  }

  if (input.individualIds.length > 0) {
    searchParams.set('individualIds', input.individualIds.join(','))
  }

  const queryString = searchParams.toString()
  return queryString ? `/api/email/recipients?${queryString}` : '/api/email/recipients'
}

export function EmailClient({ resendDailyLimit }: EmailClientProps) {
  const [includeActiveMembers, setIncludeActiveMembers] = useState(false)
  const [includeExpiringMembers, setIncludeExpiringMembers] = useState(false)
  const [includeExpiredMembers, setIncludeExpiredMembers] = useState(false)
  const [includeMemberTypes, setIncludeMemberTypes] = useState(false)
  const [selectedMemberTypeIds, setSelectedMemberTypeIds] = useState<string[]>([])
  const [selectedIndividuals, setSelectedIndividuals] = useState<EmailRecipientWithId[]>([])
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [draftIdempotencyKey, setDraftIdempotencyKey] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { members, isLoading: isMembersLoading, error: membersError } = useMembers()
  const { memberTypes, isLoading: isMemberTypesLoading, error: memberTypesError } = useMemberTypes()
  const activeMemberTypes = useMemo(
    () => memberTypes.filter((memberType) => memberType.is_active),
    [memberTypes],
  )
  const selectedIndividualIds = useMemo(
    () => selectedIndividuals.map((recipient) => recipient.id),
    [selectedIndividuals],
  )
  const liveRecipients = useMemo(
    () =>
      resolveDraftEmailRecipients(members, {
        activeMembers: includeActiveMembers,
        expiringMembers: includeExpiringMembers,
        expiredMembers: includeExpiredMembers,
        includeMemberTypes,
        memberTypeIds: selectedMemberTypeIds,
        individualIds: selectedIndividualIds,
      }),
    [
      includeActiveMembers,
      includeExpiringMembers,
      includeExpiredMembers,
      includeMemberTypes,
      members,
      selectedIndividualIds,
      selectedMemberTypeIds,
    ],
  )
  const dedupedLiveRecipients = useMemo(
    () => dedupeRecipientsByEmail(liveRecipients),
    [liveRecipients],
  )
  const individualPickerOptions = useMemo<SearchableSelectOption[]>(
    () =>
      members
        .flatMap((member) => {
          const recipient = toEmailRecipient(member)

          if (!recipient || selectedIndividualIds.includes(recipient.id)) {
            return []
          }

          return [
            {
              value: recipient.id,
              label: recipient.name,
              description: recipient.email,
              keywords: [recipient.email, member.employeeNo, member.status],
            } satisfies SearchableSelectOption,
          ]
        })
        .sort((left, right) => left.label.localeCompare(right.label)),
    [members, selectedIndividualIds],
  )
  const isBodyEmpty = !hasMeaningfulHtmlContent(bodyHtml)
  const recipientCount = dedupedLiveRecipients.length
  const shouldShowLimitWarning = recipientCount > resendDailyLimit
  const isSendDisabled =
    isSending || recipientCount === 0 || !subject.trim() || isBodyEmpty || isMembersLoading

  const handleDraftChanged = () => {
    setDraftIdempotencyKey(null)
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
    ],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'min-h-[240px] px-4 py-3 text-sm focus:outline-none [&_ol]:ml-6 [&_ol]:list-decimal [&_ol]:space-y-1 [&_p]:my-2 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-1',
      },
    },
    onUpdate({ editor: nextEditor }) {
      handleDraftChanged()
      setBodyHtml(nextEditor.getHTML())
    },
  })

  const handleSelectIndividual = (memberId: string) => {
    const recipientToAdd = resolveDraftEmailRecipients(members, {
      activeMembers: false,
      expiringMembers: false,
      expiredMembers: false,
      includeMemberTypes: false,
      memberTypeIds: [],
      individualIds: [memberId],
    })[0]

    if (!recipientToAdd) {
      return
    }

    handleDraftChanged()
    setSelectedIndividuals((currentRecipients) => {
      if (currentRecipients.some((recipient) => recipient.id === recipientToAdd.id)) {
        return currentRecipients
      }

      return [...currentRecipients, recipientToAdd]
    })
  }

  const handleRemoveIndividual = (memberId: string) => {
    handleDraftChanged()
    setSelectedIndividuals((currentRecipients) =>
      currentRecipients.filter((recipient) => recipient.id !== memberId),
    )
  }

  const handleToggleMemberType = (memberTypeId: string, checked: boolean) => {
    handleDraftChanged()
    setSelectedMemberTypeIds((currentIds) => {
      if (checked) {
        return currentIds.includes(memberTypeId) ? currentIds : [...currentIds, memberTypeId]
      }

      return currentIds.filter((currentId) => currentId !== memberTypeId)
    })
  }

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null

    if (!file) {
      handleDraftChanged()
      setAttachment(null)
      setAttachmentError(null)
      return
    }

    if (file.size > ADMIN_EMAIL_ATTACHMENT_MAX_BYTES) {
      setAttachment(null)
      setAttachmentError('Attachment must be 15MB or under.')
      event.target.value = ''
      return
    }

    handleDraftChanged()
    setAttachment(file)
    setAttachmentError(null)
  }

  const resetForm = () => {
    setIncludeActiveMembers(false)
    setIncludeExpiringMembers(false)
    setIncludeExpiredMembers(false)
    setIncludeMemberTypes(false)
    setSelectedMemberTypeIds([])
    setSelectedIndividuals([])
    setSubject('')
    setAttachment(null)
    setAttachmentError(null)
    setDraftIdempotencyKey(null)
    setBodyHtml('')
    editor?.commands.clearContent()
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSend = async () => {
    if (isSendDisabled) {
      return
    }

    setIsSending(true)

    try {
      const idempotencyKey = draftIdempotencyKey ?? createIdempotencyKey()

      if (draftIdempotencyKey !== idempotencyKey) {
        setDraftIdempotencyKey(idempotencyKey)
      }

      const recipientsResponse = await fetch(
        buildRecipientsLookupUrl({
          activeMembers: includeActiveMembers,
          expiringMembers: includeExpiringMembers,
          expiredMembers: includeExpiredMembers,
          memberTypeIds: includeMemberTypes ? selectedMemberTypeIds : [],
          individualIds: selectedIndividualIds,
        }),
        {
          method: 'GET',
          cache: 'no-store',
        },
      )

      let recipientsResponseBody: RecipientsSuccessResponse | ErrorResponse | null = null

      try {
        recipientsResponseBody = (await recipientsResponse.json()) as
          | RecipientsSuccessResponse
          | ErrorResponse
      } catch {
        recipientsResponseBody = null
      }

      if (
        !recipientsResponse.ok ||
        !recipientsResponseBody ||
        !('recipients' in recipientsResponseBody)
      ) {
        throw new Error(
          getResponseErrorMessage(
            recipientsResponseBody,
            'Failed to resolve email recipients.',
          ),
        )
      }

      const resolvedRecipients = recipientsResponseBody.recipients.map(({ name, email }) => ({
        name,
        email,
      }))
      const recipientsToSend: EmailRecipient[] = dedupeRecipientsByEmail(resolvedRecipients)

      if (recipientsToSend.length === 0) {
        throw new Error('Select at least one recipient before sending.')
      }

      const formData = new FormData()
      formData.set('subject', subject.trim())
      formData.set('body', bodyHtml)
      formData.set('recipients', JSON.stringify(recipientsToSend))
      formData.set('idempotencyKey', idempotencyKey)

      if (attachment) {
        formData.set('attachment', attachment)
      }

      const sendResponse = await fetch('/api/email/send', {
        method: 'POST',
        body: formData,
      })

      let sendResponseBody: SendSuccessResponse | ErrorResponse | null = null

      try {
        sendResponseBody = (await sendResponse.json()) as SendSuccessResponse | ErrorResponse
      } catch {
        sendResponseBody = null
      }

      if (!sendResponse.ok || !sendResponseBody || !('sentCount' in sendResponseBody)) {
        throw new Error(
          getResponseErrorMessage(sendResponseBody, 'Failed to send the email.'),
        )
      }

      toast({
        ...getSendSuccessToast(sendResponseBody),
      })

      if (sendResponseBody.skippedDueToQuotaCount === 0) {
        resetForm()
      }
    } catch (error) {
      toast({
        title: 'Send failed',
        description:
          error instanceof Error ? error.message : 'Failed to send the email.',
        variant: 'destructive',
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Send Email</h1>
        <p className="text-muted-foreground">
          Compose and send an email to selected Evolutionz Fitness members.
        </p>
      </div>

      <form
        className="grid grid-cols-1 gap-6 items-start lg:grid-cols-12"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSend()
        }}
      >
        <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-6">
          <section className="space-y-6 flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-foreground">
                <Users className="h-5 w-5" />
                <h2 className="text-xl font-semibold tracking-tight">Recipients</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Combine filters and members. Duplicates are removed.
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-transparent hover:bg-muted/50 p-2 -mx-2 transition-colors">
                  <Checkbox
                    id="email-active-members"
                    checked={includeActiveMembers}
                    onCheckedChange={(checked) => {
                      handleDraftChanged()
                      setIncludeActiveMembers(checked === true)
                    }}
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="email-active-members" className="cursor-pointer">All active members</Label>
                    <p className="text-xs text-muted-foreground">
                      Members whose status is currently Active.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-transparent hover:bg-muted/50 p-2 -mx-2 transition-colors">
                  <Checkbox
                    id="email-expiring-members"
                    checked={includeExpiringMembers}
                    onCheckedChange={(checked) => {
                      handleDraftChanged()
                      setIncludeExpiringMembers(checked === true)
                    }}
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="email-expiring-members" className="cursor-pointer">All expiring members</Label>
                    <p className="text-xs text-muted-foreground">
                      Active members whose membership ends within the next 7 days.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-transparent hover:bg-muted/50 p-2 -mx-2 transition-colors">
                  <Checkbox
                    id="email-expired-members"
                    checked={includeExpiredMembers}
                    onCheckedChange={(checked) => {
                      handleDraftChanged()
                      setIncludeExpiredMembers(checked === true)
                    }}
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="email-expired-members" className="cursor-pointer">All expired members</Label>
                    <p className="text-xs text-muted-foreground">
                      Members whose status is currently Expired.
                    </p>
                  </div>
                </div>

                <div className={cn("space-y-4 rounded-xl border p-4 transition-colors", includeMemberTypes ? "border-primary/20 bg-primary/5" : "border-border/70 bg-muted/20 hover:border-border")}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="email-member-types"
                      checked={includeMemberTypes}
                      onCheckedChange={(checked) => {
                        handleDraftChanged()
                        setIncludeMemberTypes(checked === true)
                      }}
                      className="mt-1"
                    />
                    <div className="space-y-1">
                      <Label htmlFor="email-member-types" className="cursor-pointer">By membership type</Label>
                      <p className="text-xs text-muted-foreground">
                        Choose one or more active membership types to include.
                      </p>
                    </div>
                  </div>

                  {includeMemberTypes ? (
                    <div className="rounded-xl border border-dashed border-border bg-background/80 p-4">
                      {isMemberTypesLoading ? (
                        <p className="text-sm text-muted-foreground">Loading membership types...</p>
                      ) : activeMemberTypes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No active membership types are available.
                        </p>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-1">
                          {activeMemberTypes.map((memberType) => {
                            const checkboxId = `email-member-type-${memberType.id}`
                            const isChecked = selectedMemberTypeIds.includes(memberType.id)

                            return (
                              <label
                                key={memberType.id}
                                htmlFor={checkboxId}
                                className={cn("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors", isChecked ? "border-primary/50 bg-primary/10" : "border-border bg-card hover:bg-muted/50")}
                              >
                                <Checkbox
                                  id={checkboxId}
                                  checked={isChecked}
                                  onCheckedChange={(checked) =>
                                    handleToggleMemberType(memberType.id, checked === true)
                                  }
                                  className="mt-0.5"
                                />
                                <span className="space-y-1">
                                  <span className="block text-sm font-medium text-foreground">
                                    {memberType.name}
                                  </span>
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <Label htmlFor="email-member-picker">Add individual members</Label>
                  <p className="text-xs text-muted-foreground">
                    Search members by name and add them one at a time.
                  </p>
                </div>

                <div id="email-member-picker">
                  <SearchableSelect
                    value={null}
                    onValueChange={handleSelectIndividual}
                    options={individualPickerOptions}
                    placeholder={isMembersLoading ? 'Loading members...' : 'Search members by name'}
                    searchPlaceholder="Search members..."
                    emptyMessage="No members with email addresses found."
                    disabled={isMembersLoading || individualPickerOptions.length === 0}
                  />
                </div>

                {selectedIndividuals.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {selectedIndividuals.map((recipient) => (
                       <Badge
                         key={recipient.id}
                         variant="secondary"
                         className="gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                       >
                         <span className="max-w-[180px] truncate">
                           {recipient.name}
                         </span>
                         <button
                           type="button"
                           className="rounded-full bg-muted-foreground/20 p-0.5 text-muted-foreground transition hover:bg-destructive/20 hover:text-destructive"
                           onClick={() => handleRemoveIndividual(recipient.id)}
                           aria-label={`Remove ${recipient.name}`}
                         >
                           <X className="h-3 w-3" />
                         </button>
                       </Badge>
                     ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-auto pt-6 space-y-3">
              <div className={cn("rounded-xl p-4 text-center transition-colors", recipientCount > 0 ? "bg-primary/10 text-primary-foreground" : "bg-muted/50")}>
                <p className={cn("text-2xl font-bold", recipientCount > 0 ? "text-primary" : "text-muted-foreground")}>
                  {recipientCount}
                </p>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Recipient{recipientCount === 1 ? '' : 's'} Selected
                </p>
              </div>
              
              {shouldShowLimitWarning ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
                  You can send up to {formatRecipientLabel(resendDailyLimit)} per day. Only the
                  first {formatRecipientLabel(resendDailyLimit)} will receive this email.
                </div>
              ) : null}
              {membersError ? (
                <p className="text-sm text-destructive">{membersError.message}</p>
              ) : null}
              {memberTypesError ? (
                <p className="text-sm text-destructive">{memberTypesError.message}</p>
              ) : null}
            </div>
          </section>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6">
          <section className="space-y-6 rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-foreground">
                <PenLine className="h-5 w-5" />
                <h2 className="text-xl font-semibold tracking-tight">Compose</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Write the subject, rich-text body, and optional attachment.
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email-subject" className="text-sm font-semibold">Subject</Label>
                <Input
                  id="email-subject"
                  type="text"
                  value={subject}
                  onChange={(event) => {
                    handleDraftChanged()
                    setSubject(event.target.value)
                  }}
                  placeholder="Enter an email subject"
                  disabled={isSending}
                  className="h-11 shadow-sm font-medium"
                  required
                />
              </div>

              <div className="space-y-2 flex flex-col">
                <Label className="text-sm font-semibold">Email body</Label>
                <div className="flex-1 flex flex-col rounded-xl border border-border shadow-sm overflow-hidden focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-shadow">
                  <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 px-3 py-2">
                    <Toggle
                      type="button"
                      size="sm"
                      className="h-8 w-8 p-0 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                      pressed={editor?.isActive('bold') ?? false}
                      onPressedChange={() => editor?.chain().focus().toggleBold().run()}
                      disabled={!editor || isSending}
                      aria-label="Bold"
                    >
                      <Bold className="h-4 w-4" />
                    </Toggle>
                    <Toggle
                      type="button"
                      size="sm"
                      className="h-8 w-8 p-0 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                      pressed={editor?.isActive('italic') ?? false}
                      onPressedChange={() => editor?.chain().focus().toggleItalic().run()}
                      disabled={!editor || isSending}
                      aria-label="Italic"
                    >
                      <Italic className="h-4 w-4" />
                    </Toggle>
                    <Toggle
                      type="button"
                      size="sm"
                      className="h-8 w-8 p-0 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                      pressed={editor?.isActive('underline') ?? false}
                      onPressedChange={() => editor?.chain().focus().toggleUnderline().run()}
                      disabled={!editor || isSending}
                      aria-label="Underline"
                    >
                      <UnderlineIcon className="h-4 w-4" />
                    </Toggle>
                    <div className="mx-1 h-4 w-px bg-border" />
                    <Toggle
                      type="button"
                      size="sm"
                      className="h-8 w-8 p-0 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                      pressed={editor?.isActive('bulletList') ?? false}
                      onPressedChange={() => editor?.chain().focus().toggleBulletList().run()}
                      disabled={!editor || isSending}
                      aria-label="Bullet list"
                    >
                      <List className="h-4 w-4" />
                    </Toggle>
                    <Toggle
                      type="button"
                      size="sm"
                      className="h-8 w-8 p-0 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                      pressed={editor?.isActive('orderedList') ?? false}
                      onPressedChange={() => editor?.chain().focus().toggleOrderedList().run()}
                      disabled={!editor || isSending}
                      aria-label="Ordered list"
                    >
                      <ListOrdered className="h-4 w-4" />
                    </Toggle>
                  </div>
                  <div
                    className={cn(
                      'flex-1 bg-background transition-colors',
                      isBodyEmpty ? 'bg-muted/5' : '',
                    )}
                  >
                    <EditorContent editor={editor} />
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label htmlFor="email-attachment" className="text-sm font-semibold">Attachment</Label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <Input
                    id="email-attachment"
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAttachmentChange}
                    disabled={isSending}
                    className="max-w-md h-10 shadow-sm file:mr-4 file:py-1 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  />
                  {!attachment && !attachmentError && (
                    <span className="text-xs text-muted-foreground">Up to 15MB</span>
                  )}
                </div>
                {attachment ? (
                  <div className="mt-2 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Paperclip className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="truncate font-medium text-foreground">
                          {attachment.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatAttachmentSize(attachment.size)}
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        handleDraftChanged()
                        setAttachment(null)
                        if (fileInputRef.current) {
                          fileInputRef.current.value = ''
                        }
                      }}
                      disabled={isSending}
                      className="h-8 hover:bg-destructive/10 hover:text-destructive"
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
                {attachmentError ? (
                  <p className="text-sm font-medium text-destructive mt-2">{attachmentError}</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 overflow-hidden relative">
            <div className="absolute inset-0 bg-linear-to-r from-primary/5 via-transparent to-transparent pointer-events-none" />
            
            <div className="relative space-y-1 z-10">
              <h3 className="text-lg font-semibold tracking-tight">Ready to send?</h3>
              <p className="text-sm text-muted-foreground">
                The message is sent immediately and is not stored in the app.
              </p>
            </div>
            <Button 
              type="submit" 
              size="lg"
              disabled={isSendDisabled} 
              className="w-full sm:w-auto relative z-10 sm:min-w-[160px] shadow-md hover:shadow-lg transition-all"
            >
              {isSending ? (
                <Spinner className="mr-2" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {isSending ? 'Sending...' : 'Send Email'}
            </Button>
          </section>
        </div>
      </form>
    </div>
  )
}
