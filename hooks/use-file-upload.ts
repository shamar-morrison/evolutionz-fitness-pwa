'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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

function revokeFilePreview(file: FileWithPreview) {
  URL.revokeObjectURL(file.preview)
}

function revokeFilePreviews(files: FileWithPreview[]) {
  for (const file of files) {
    revokeFilePreview(file)
  }
}

function getRemovedFiles(
  currentFiles: FileWithPreview[],
  nextFiles: FileWithPreview[],
): FileWithPreview[] {
  const nextIds = new Set(nextFiles.map((file) => file.id))
  return currentFiles.filter((file) => !nextIds.has(file.id))
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
  const filesRef = useRef<FileWithPreview[]>([])
  const [files, setFiles] = useState<FileWithPreview[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const syncFiles = useCallback(
    (nextFiles: FileWithPreview[]) => {
      filesRef.current = nextFiles
      setFiles(nextFiles)
      onFilesChange?.(nextFiles)
    },
    [onFilesChange],
  )

  useEffect(() => {
    return () => {
      revokeFilePreviews(filesRef.current)
      filesRef.current = []
    }
  }, [])

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

      const currentFiles = filesRef.current
      const nextFiles =
        maxFiles === 1
          ? accepted.slice(0, 1)
          : [...currentFiles, ...accepted].slice(0, maxFiles)

      revokeFilePreviews(getRemovedFiles(currentFiles, nextFiles))
      revokeFilePreviews(getRemovedFiles(accepted, nextFiles))
      syncFiles(nextFiles)
    },
    [accept, maxFiles, maxSize, syncFiles],
  )

  const removeFile = useCallback(
    (id: string) => {
      const currentFiles = filesRef.current
      const nextFiles = currentFiles.filter((file) => file.id !== id)

      revokeFilePreviews(getRemovedFiles(currentFiles, nextFiles))
      syncFiles(nextFiles)
    },
    [syncFiles],
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
