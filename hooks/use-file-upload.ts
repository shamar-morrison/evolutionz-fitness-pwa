'use client'

import { useCallback, useRef, useState } from 'react'

export interface FileWithPreview {
  id: string
  file: File
  preview: string
  name: string
  size: number
  type: string
}

interface UseFileUploadOptions {
  maxFiles?: number
  maxSize?: number
  accept?: string
  multiple?: boolean
  onFilesChange?: (files: FileWithPreview[]) => void
}

interface FileUploadState {
  files: FileWithPreview[]
  isDragging: boolean
  errors: string[]
}

interface FileUploadActions {
  removeFile: (id: string) => void
  handleDragEnter: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => void
  openFileDialog: () => void
  getInputProps: () => React.InputHTMLAttributes<HTMLInputElement>
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 11)
}

export function useFileUpload(
  options: UseFileUploadOptions = {},
): [FileUploadState, FileUploadActions] {
  const {
    maxFiles = 1,
    maxSize = 5 * 1024 * 1024,
    accept = '*',
    multiple = false,
    onFilesChange,
  } = options

  const inputRef = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState<FileWithPreview[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const processFiles = useCallback(
    (incoming: File[]) => {
      const newErrors: string[] = []
      const accepted: FileWithPreview[] = []

      for (const file of incoming) {
        if (file.size > maxSize) {
          newErrors.push(`"${file.name}" exceeds the ${formatBytes(maxSize)} size limit.`)
          continue
        }

        if (accept !== '*') {
          const acceptedTypes = accept.split(',').map((t) => t.trim())
          const isAccepted = acceptedTypes.some((type) => {
            if (type.endsWith('/*')) {
              return file.type.startsWith(type.replace('/*', '/'))
            }
            return file.type === type || file.name.endsWith(type.replace('*', ''))
          })
          if (!isAccepted) {
            newErrors.push(`"${file.name}" is not an accepted file type.`)
            continue
          }
        }

        accepted.push({
          id: generateId(),
          file,
          preview: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
          type: file.type,
        })
      }

      setErrors(newErrors)

      setFiles((prev) => {
        const next = maxFiles === 1 ? accepted : [...prev, ...accepted].slice(0, maxFiles)
        onFilesChange?.(next)
        return next
      })
    },
    [accept, maxFiles, maxSize, onFilesChange],
  )

  const removeFile = useCallback(
    (id: string) => {
      setFiles((prev) => {
        const removed = prev.find((f) => f.id === id)
        if (removed) URL.revokeObjectURL(removed.preview)
        const next = prev.filter((f) => f.id !== id)
        onFilesChange?.(next)
        return next
      })
    },
    [onFilesChange],
  )

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      const dropped = Array.from(e.dataTransfer.files)
      processFiles(dropped)
    },
    [processFiles],
  )

  const openFileDialog = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const getInputProps = useCallback((): React.InputHTMLAttributes<HTMLInputElement> & { ref: React.RefCallback<HTMLInputElement> } => {
    return {
      ref: (el: HTMLInputElement | null) => {
        inputRef.current = el
      },
      type: 'file',
      accept,
      multiple: multiple && maxFiles > 1,
      onChange: (e) => {
        const selected = Array.from(e.target.files ?? [])
        processFiles(selected)
        // reset so same file can be re-selected
        e.target.value = ''
      },
      className: 'sr-only',
    }
  }, [accept, multiple, maxFiles, processFiles])

  return [
    { files, isDragging, errors },
    { removeFile, handleDragEnter, handleDragLeave, handleDragOver, handleDrop, openFileDialog, getInputProps },
  ]
}
