/**
 * Centralized token display helpers.
 *
 * Use these everywhere a token name, symbol, or address is displayed
 * to ensure consistent fallback behavior across the app.
 */

/** Short address: "7LiXn3...j8ky" */
export function shortAddr(addr: string, head = 6, tail = 4): string {
  if (!addr || addr.length <= head + tail + 3) return addr || '';
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

/** Token display name with fallback chain: name → symbol → short address */
export function tokenName(
  name?: string | null,
  symbol?: string | null,
  mint?: string | null,
): string {
  if (name && name.trim()) return name.trim();
  if (symbol && symbol.trim()) return symbol.trim();
  if (mint) return shortAddr(mint);
  return 'Unknown';
}

/** Token symbol with $ prefix, or empty string */
export function tokenSymbol(symbol?: string | null): string {
  if (symbol && symbol.trim()) return `$${symbol.trim()}`;
  return '';
}

/** Full token label: "TokenName ($SYM)" or just name */
export function tokenLabel(
  name?: string | null,
  symbol?: string | null,
  mint?: string | null,
): string {
  const n = tokenName(name, symbol, mint);
  const s = symbol?.trim();
  if (s && n !== s) return `${n} (${tokenSymbol(symbol)})`;
  return n;
}
