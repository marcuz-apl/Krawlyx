/** Tiny cron → human-string helper.

  Mirrors the backend's `app.services.scheduler.humanize_cron` with enhanced
  human-readable interpretations for standard 5-field cron expressions.
*/

export function humanizeCron(cron: string, tz = 'UTC'): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return `cron: ${cron}`;
  const [minute, hour, dom, month, dow] = parts;

  const intOrNull = (s: string) => {
    const n = Number(s);
    return Number.isInteger(n) ? n : null;
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Every N minutes: */N * * * *
  if (minute.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return `Every ${minute.slice(2)} minutes`;
  }

  // Every hour at :MM: 15 * * * *
  if (hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const m = intOrNull(minute);
    if (m !== null) return `Every hour at minute :${String(m).padStart(2, '0')}`;
  }

  // Every N hours: 0 */N * * *
  if (hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*') {
    const m = intOrNull(minute) ?? 0;
    return `Every ${hour.slice(2)} hours at minute :${String(m).padStart(2, '0')}`;
  }

  // Daily at specific time: 0 2 * * *
  if (dom === '*' && month === '*' && dow === '*') {
    const m = intOrNull(minute);
    const h = intOrNull(hour);
    if (m !== null && h !== null) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `Daily at ${h12}:${String(m).padStart(2, '0')} ${ampm} (${tz})`;
    }
  }

  // Multiple hours per day: 0 8,20 * * *
  if (hour.includes(',') && dom === '*' && month === '*' && dow === '*') {
    const m = intOrNull(minute) ?? 0;
    const hours = hour.split(',').map(h => {
      const n = Number(h);
      if (isNaN(n)) return h;
      const ampm = n >= 12 ? 'PM' : 'AM';
      const h12 = n % 12 || 12;
      return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    });
    return `Daily at ${hours.join(' & ')} (${tz})`;
  }

  // Weekly on specific day: 0 3 * * 1
  if (dom === '*' && month === '*' && dow !== '*') {
    const m = intOrNull(minute) ?? 0;
    const h = intOrNull(hour) ?? 0;
    const dowNum = intOrNull(dow);
    const dayLabel = dowNum !== null && dowNum >= 0 && dowNum <= 6 ? dayNames[dowNum] : `DoW ${dow}`;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `Every ${dayLabel} at ${h12}:${String(m).padStart(2, '0')} ${ampm} (${tz})`;
  }

  // Monthly on 1st: 0 4 1 * *
  if (dom !== '*' && month === '*' && dow === '*') {
    const m = intOrNull(minute) ?? 0;
    const h = intOrNull(hour) ?? 0;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `Monthly on day ${dom} at ${h12}:${String(m).padStart(2, '0')} ${ampm} (${tz})`;
  }

  return `cron: ${cron} (${tz})`;
}
