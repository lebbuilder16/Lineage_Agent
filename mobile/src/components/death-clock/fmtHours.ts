/** Format a fractional-hours value into a compact human-readable string. */
export function fmtHours(h: number): string {
  if (h <= 0) return '0m';
  const totalMins = Math.floor(h * 60);
  const days = Math.floor(totalMins / (60 * 24));
  const hrs = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}
