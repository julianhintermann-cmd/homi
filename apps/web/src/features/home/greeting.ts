/**
 * Greeting above the Home title ("Guten Morgen" in the design) by local time:
 * 05:00–10:59 "Guten Morgen", 11:00–17:59 "Guten Tag", otherwise "Guten Abend".
 */
export function greetingFor(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'Guten Morgen';
  if (hour >= 11 && hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

/** Milliseconds until the greeting can change next (top of the next hour). */
export function msUntilNextHour(date: Date = new Date()): number {
  const next = new Date(date);
  next.setHours(date.getHours() + 1, 0, 0, 0);
  return Math.max(1_000, next.getTime() - date.getTime());
}
