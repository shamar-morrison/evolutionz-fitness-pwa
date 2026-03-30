"use client"

import * as React from "react"
import { Avatar as BaseAvatar } from "@base-ui/react/avatar"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const avatarVariants = cva(
  "relative flex shrink-0 overflow-hidden rounded-full",
  {
    variants: {
      size: {
        default: "size-8",
        sm: "size-6",
        lg: "size-12",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function Avatar({
  className,
  size,
  ...props
}: React.ComponentProps<typeof BaseAvatar.Root> &
  VariantProps<typeof avatarVariants>) {
  return (
    <BaseAvatar.Root
      data-slot="avatar"
      className={cn(avatarVariants({ size, className }))}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof BaseAvatar.Image>) {
  return (
    <BaseAvatar.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof BaseAvatar.Fallback>) {
  return (
    <BaseAvatar.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full text-sm font-medium",
        className
      )}
      {...props}
    />
  )
}

function AvatarBadge({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background bg-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "flex -space-x-2 [&>[data-slot=avatar]]:ring-2 [&>[data-slot=avatar]]:ring-background",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-group-count"
      className={cn(
        "bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-full text-xs font-medium ring-2 ring-background",
        className
      )}
      {...props}
    />
  )
}

export {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
}
