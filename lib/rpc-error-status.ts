export function getBaseRpcErrorStatus(message: string): number | null {
  if (message === 'Member not found.') {
    return 404
  }

  if (
    message === 'This request has already been reviewed.' ||
    message === 'Member has no active membership.'
  ) {
    return 400
  }

  return null
}
