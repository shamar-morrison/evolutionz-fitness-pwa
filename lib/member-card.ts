function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function getAssignedCardNo(cardNo: string | null | undefined) {
  const normalizedCardNo = normalizeText(cardNo)
  return normalizedCardNo || null
}

export function hasAssignedCard(cardNo: string | null | undefined): cardNo is string {
  return getAssignedCardNo(cardNo) !== null
}
