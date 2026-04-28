export function parsePartialJsonArray<T>(text: string, validate: (obj: unknown) => T | null): T[] {
  const arrayStart = text.indexOf('[');
  if (arrayStart === -1) return [];

  const content = text.slice(arrayStart + 1);
  const items: T[] = [];

  let depth = 0;
  let objectStart = -1;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objectStart !== -1) {
        const objectStr = content.slice(objectStart, i + 1);
        try {
          const parsed = JSON.parse(objectStr);
          const validated = validate(parsed);
          if (validated !== null) {
            items.push(validated);
          }
        } catch {
          // Object not yet valid JSON, skip
        }
        objectStart = -1;
      }
    }
  }

  return items;
}
