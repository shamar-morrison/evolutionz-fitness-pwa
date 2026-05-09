import { redirect } from 'next/navigation'
import { CardsInventoryPage } from '@/components/cards-inventory-page'
import { requireAdminUser } from '@/lib/server-auth'

export default async function CardsPage() {
  const authResult = await requireAdminUser()

  if ('response' in authResult) {
    redirect(authResult.response.status === 401 ? '/login' : '/unauthorized')
  }

  return <CardsInventoryPage />
}
