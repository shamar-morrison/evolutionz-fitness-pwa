import type { MemberTypeRecord } from '@/types'

export type MemberTypesReadClient = {
  from(table: 'member_types'): {
    select(columns: string): {
      order(
        column: 'created_at',
        options: {
          ascending: boolean
        },
      ): PromiseLike<{
        data: MemberTypeRecord[] | null
        error: {
          message: string
        } | null
      }>
      eq(column: 'id', value: string): {
        maybeSingle(): PromiseLike<{
          data: MemberTypeRecord | null
          error: {
            message: string
          } | null
        }>
      }
    }
  }
}

export async function readMemberTypes(
  supabase: MemberTypesReadClient,
): Promise<MemberTypeRecord[]> {
  const { data, error } = await supabase
    .from('member_types')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to read membership types: ${error.message}`)
  }

  return (data ?? []) as MemberTypeRecord[]
}

export async function readMemberTypeById(
  supabase: MemberTypesReadClient,
  id: string,
): Promise<MemberTypeRecord | null> {
  const { data, error } = await supabase
    .from('member_types')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read membership type ${id}: ${error.message}`)
  }

  return data ?? null
}
