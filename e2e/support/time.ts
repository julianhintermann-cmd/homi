const ZURICH = 'Europe/Zurich';

/** Today's date (YYYY-MM-DD) in Europe/Zurich. */
export function zurichToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZURICH }).format(new Date());
}

function zurichOffsetMs(instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZURICH,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant at which the wall clock in Zurich shows `date` + `time` ("HH:MM" or "HH:MM:SS"), DST-aware. */
export function zurichInstant(date: string, time: string): Date {
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, mi = 0, s = 0] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = wall - zurichOffsetMs(wall);
  return new Date(wall - zurichOffsetMs(first));
}
