function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function getCleanMemberName(name: string, cardCode: string | null | undefined) {
  const rawName = normalizeText(name)
  const prefix = normalizeText(cardCode)

  if (!rawName || !prefix) {
    return rawName
  }

  const prefixPattern = new RegExp(`^${escapeRegExp(prefix)}(?=\\s|$)`, 'i')

  if (!prefixPattern.test(rawName)) {
    return rawName
  }

  return normalizeText(rawName.replace(prefixPattern, ''))
}

export function buildMemberDisplayName(name: string, cardCode: string | null | undefined) {
  const cleanName = getCleanMemberName(name, cardCode)
  const prefix = normalizeText(cardCode)

  if (!prefix) {
    return cleanName
  }

  return cleanName ? `${prefix} ${cleanName}` : prefix
}

export function buildHikMemberName(name: string, cardCode: string | null | undefined) {
  return buildMemberDisplayName(getCleanMemberName(name, cardCode), cardCode)
}

export function hasUsableCardCode(cardCode: string | null | undefined) {
  return normalizeText(cardCode).length > 0
}
