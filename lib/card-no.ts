const controlCharacterPattern = /[\u0000-\u001F\u007F]/

export function normalizeCardNo(cardNo: string) {
  return cardNo.trim()
}

export function getManualCardNoValidationError(cardNo: string) {
  const normalizedCardNo = normalizeCardNo(cardNo)

  if (!normalizedCardNo) {
    return 'Card number is required.'
  }

  if (controlCharacterPattern.test(normalizedCardNo)) {
    return 'Manual card numbers cannot contain control characters or line breaks.'
  }

  return null
}
