import type { Member, MemberType } from '@/types'

// TODO: Replace with Supabase mutations

export type AddMemberData = {
  name: string
  cardNo: string
  type: MemberType
  expiry: string
}

export async function addMember(data: AddMemberData): Promise<Member> {
  // TODO: Replace with Supabase insert
  console.log('Adding member:', data)
  await new Promise((resolve) => setTimeout(resolve, 500))
  
  return {
    id: crypto.randomUUID(),
    ...data,
    status: 'Active',
    balance: 0,
    createdAt: new Date().toISOString(),
  }
}

export type UpdateMemberData = Partial<AddMemberData>

export async function updateMember(id: string, data: UpdateMemberData): Promise<Member> {
  // TODO: Replace with Supabase update
  console.log('Updating member:', id, data)
  await new Promise((resolve) => setTimeout(resolve, 500))
  
  // Return mock updated member
  return {
    id,
    name: data.name ?? 'Unknown',
    cardNo: data.cardNo ?? 'EF-000000',
    type: data.type ?? 'General',
    expiry: data.expiry ?? new Date().toISOString(),
    status: 'Active',
    balance: 0,
    createdAt: new Date().toISOString(),
  }
}

export async function suspendMember(id: string): Promise<void> {
  // TODO: Replace with Supabase update
  console.log('Suspending member:', id)
  await new Promise((resolve) => setTimeout(resolve, 500))
}

export async function reactivateMember(id: string): Promise<void> {
  // TODO: Replace with Supabase update
  console.log('Reactivating member:', id)
  await new Promise((resolve) => setTimeout(resolve, 500))
}

export async function revokeCardAccess(id: string): Promise<void> {
  // TODO: Replace with Supabase update
  console.log('Revoking card access for member:', id)
  await new Promise((resolve) => setTimeout(resolve, 500))
}
