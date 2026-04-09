import { NextResponse } from 'next/server'
import manifest from '@/app/manifest'

export const dynamic = 'force-static'

export function GET() {
  return new NextResponse(JSON.stringify(manifest()), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
    },
  })
}
