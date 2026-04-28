function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\n]/g, '');
}

export function findAnchorLine(specContent: string, anchor: string): number {
  const normalizedSpec = normalizeForSearch(specContent);
  const normalizedAnchor = normalizeForSearch(anchor);

  if (!normalizedAnchor) return -1;

  const anchorIndex = normalizedSpec.indexOf(normalizedAnchor);
  if (anchorIndex === -1) return -1;

  const beforeAnchor = normalizedSpec.substring(0, anchorIndex);
  return (beforeAnchor.match(/\n/g) || []).length;
}
