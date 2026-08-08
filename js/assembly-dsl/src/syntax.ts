export function lines(source: string): string[] {
  return source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
}

export function unquote(value: string): string {
  const normalized = value.trim();
  return normalized.startsWith('"') && normalized.endsWith('"') ? normalized.slice(1, -1) : normalized;
}
