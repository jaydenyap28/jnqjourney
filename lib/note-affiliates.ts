export function explicitNoteAffiliateIds(blocks: { type: string; affiliateIds?: number[] }[]) {
  return [...new Set(blocks.filter(block => block.type === 'affiliate').flatMap(block => block.affiliateIds || []))]
    .filter(id => Number.isSafeInteger(id) && id > 0)
}
