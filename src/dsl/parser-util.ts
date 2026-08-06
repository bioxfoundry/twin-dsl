export function lines(source: string): string[] {
  return source.split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith("#"));
}
export function unquote(value: string): string {
  const x = value.trim();
  return x.startsWith('"') && x.endsWith('"') ? x.slice(1, -1) : x;
}
export function list(value: string): string[] {
  const x = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  return x ? x.split(",").map((s) => unquote(s.trim())) : [];
}
export function kv(line: string): [string, string] {
  const i = line.indexOf(" ");
  if (i < 0) throw new Error(`EXPECTED_KEY_VALUE:${line}`);
  return [line.slice(0, i).toUpperCase(), line.slice(i + 1).trim()];
}
