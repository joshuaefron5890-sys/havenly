export function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email || '';
  if (!source) return '?';
  const parts = source.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
