/** Tiny cron → human-string helper.

  Mirrors the backend's `app.services.scheduler.humanize_cron` so the
  SPA can render a friendly summary without an extra round-trip.
  Only covers the common shapes; everything else falls back to the
  raw expression.
*/

export function humanizeCron(cron: string, tz = 'UTC'): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return `cron: ${cron}`;
  const [minute, hour, dom, month, dow] = parts;

  const intOrNull = (s: string) => {
    const n = Number(s);
    return Number.isInteger(n) ? n : null;
  };
  const m = intOrNull(minute);
  const h = intOrNull(hour);
  const everyDay = dom === '*' && month === '*' && dow === '*';
  const everyMin = minute.startsWith('*/') && everyDay && hour === '*';

  if (everyMin) return `Every ${minute.slice(2)} minutes`;
  if (everyDay && m !== null && h !== null) {
    return `Every day at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} (${tz})`;
  }
  if (everyDay && minute === '0' && h !== null) {
    return `Every day at ${String(h).padStart(2, '0')}:00 (${tz})`;
  }
  if (everyDay && hour === '*' && m !== null) {
    return `Every hour at :${String(m).padStart(2, '0')} (${tz})`;
  }
  return `cron: ${cron} (${tz})`;
}
