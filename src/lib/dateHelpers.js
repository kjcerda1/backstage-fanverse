export function formatRelativeOrDate(date) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 45) return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 172800) return "Yesterday";
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year: d.getFullYear()===new Date().getFullYear() ? undefined : "numeric" });
}

// Helper: compute live daysLeft from actual date string
export const computeDaysLeft = (dateStr) => {
  try {
    const d = new Date(dateStr.replace(/(\w+ \d+),?\s*(\d{4})?/, (_, md, yr) => `${md}, ${yr||2026}`));
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = Math.round((d - today) / 86400000);
    return diff >= 0 ? diff : null;
  } catch { return null; }
};

// ─── CONCERT DAY UTILS ────────────────────────────────────────────────────────
export function parseConcertShowTime(dateISO, showTime) {
  if (!dateISO) return new Date(NaN);
  try {
    const t = (showTime || '20:00').trim();
    // Try direct parse first ("2026-05-23 8:00 PM" works in Chrome but not Safari)
    const direct = new Date(`${dateISO}T${t}`);
    if (!isNaN(direct.getTime())) return direct;
    // Parse "8:00 PM" / "7:30 PM" / "20:00" manually
    const m = t.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!m) return new Date(`${dateISO}T20:00:00`);
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const period = (m[3] || '').toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return new Date(`${dateISO}T${h.toString().padStart(2,'0')}:${min.toString().padStart(2,'0')}:00`);
  } catch { return new Date(NaN); }
}

export function getConcertStatus(concert) {
  if (!concert) return 'no_date';
  const startISO = concert.startDateISO;
  const endISO   = concert.endDateISO || startISO;
  if (!startISO) return 'no_date';

  const now      = Date.now();
  const showEnd  = parseConcertShowTime(endISO,   concert.showEndTime || '23:00');
  const showStart= parseConcertShowTime(startISO,  concert.showTime   || '20:00');
  if (isNaN(showEnd.getTime()) || isNaN(showStart.getTime())) return 'no_date';

  const msAfterEnd  = now - showEnd.getTime();
  const msToStart   = showStart.getTime() - now;
  const HOUR = 3600_000;

  if (msAfterEnd  > 72 * HOUR) return 'expired';   // >72 h after last night → hide
  if (msAfterEnd  >  0       ) return 'afterglow';  // 0–72 h post-show
  if (msToStart   <= 0       ) return 'today';      // show in progress
  if (msToStart   <= 24*HOUR ) return 'soon';       // <24 h to first night
  if (msToStart   <= 7*24*HOUR) return 'upcoming';  // 1–7 days out
  return 'future';                                  // >7 days → no Home banner
}
