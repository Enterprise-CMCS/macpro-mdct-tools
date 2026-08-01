/** Shared helpers for long MiniStack / LocalStack resource names. */

const DEFAULT_PREFIXES = ["/aws/lambda/", "app-api-ministack-", "ministack-"];

export function shortenResourceName(
  name: string,
  prefixes: string[] = DEFAULT_PREFIXES
): string {
  let short = name;
  for (const prefix of prefixes) {
    if (short.startsWith(prefix)) {
      short = short.slice(prefix.length);
    }
  }
  return short;
}

export function middleEllipsis(text: string, max = 48): string {
  if (text.length <= max) return text;
  const keep = Math.max(4, Math.floor((max - 1) / 2));
  return `${text.slice(0, keep)}…${text.slice(-keep)}`;
}

/** Case-insensitive token match against full name and shortened form. */
export function matchesResourceFilter(name: string, filter: string): boolean {
  const trimmed = filter.trim();
  if (!trimmed) return true;
  const haystacks = [
    name.toLowerCase(),
    shortenResourceName(name).toLowerCase(),
  ];
  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystacks.some((hay) => hay.includes(token)));
}

export function displayResourceName(name: string, max = 48): string {
  return middleEllipsis(shortenResourceName(name), max);
}
