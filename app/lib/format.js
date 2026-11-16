// Formatting and money/deadline helpers. The API sends money as decimal strings ("705.50") and
// metrics as integers with a per-column display already formatted; we show both verbatim where
// possible and only re-parse numbers for sorting.

const decimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-US');

export function usd(value, { compact = false } = {}) {
  const n = toNumber(value);
  if (n === null) return '—';
  if (compact && n >= 10000) return `$${compactNumber(n)}`;
  return `$${decimal.format(n)}`;
}

export function plainUsd(value) {
  const n = toNumber(value);
  if (n === null) return null;
  return `$${decimal.format(n)}`;
}

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.eE+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function count(value) {
  const n = toNumber(value);
  return n === null ? '—' : whole.format(Math.round(n));
}

export function compactNumber(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return whole.format(n);
}

// A bounty may read status "open" past its deadline. It takes entries only while it is open AND
// before its deadline.
export function acceptsEntries(competition, now = Date.now()) {
  if (!competition) return false;
  const status = String(competition.status || '').toLowerCase();
  if (status !== 'open') return false;
  const at = Date.parse(competition.deadline || '');
  if (!Number.isFinite(at)) return status === 'open';
  return at > now;
}

export function deadlineMs(competition) {
  const at = Date.parse(competition && competition.deadline ? competition.deadline : '');
  return Number.isFinite(at) ? at : null;
}

export function countdown(target, now = Date.now()) {
  if (target === null) return null;
  let ms = target - now;
  if (ms <= 0) return { past: true, text: 'Closed' };
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days > 0) return { past: false, text: `${days}d ${hours}h left` };
  if (hours > 0) return { past: false, text: `${hours}h ${minutes}m left` };
  if (minutes > 0) return { past: false, text: `${minutes}m ${seconds}s left` };
  return { past: false, text: `${seconds}s left` };
}

export function shortDate(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
  });
}

export function dayLabel(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function relative(value, now = Date.now()) {
  const ms = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(ms)) return '—';
  const diff = Math.round((ms - now) / 1000);
  const abs = Math.abs(diff);
  const unit = abs < 60 ? ['s', 1] : abs < 3600 ? ['m', 60] : abs < 86400 ? ['h', 3600] : ['d', 86400];
  const n = Math.round(abs / unit[1]);
  return diff >= 0 ? `in ${n}${unit[0]}` : `${n}${unit[0]} ago`;
}

// Numeric value of one leaderboard column cell. Prefers the row's own `values`, then parses the
// formatted `display` text without scaling it (249 stays 249; "1,024" is 1024). `precision` only
// tells how many decimals the display keeps, so it is used to read the text, never to divide.
export function columnNumber(row, column) {
  if (!row || !column) return null;
  const vals = row.values && typeof row.values === 'object' ? row.values[column.key] : undefined;
  const direct = toNumber(vals);
  if (direct !== null) return direct;
  const shown = row.display && typeof row.display === 'object' ? row.display[column.key] : undefined;
  if (typeof shown === 'string') return toNumber(shown);
  if (typeof shown === 'number') return shown;
  return null;
}

export function columnText(row, column) {
  if (!row || !column) return '—';
  const shown = row.display && typeof row.display === 'object' ? row.display[column.key] : undefined;
  if (typeof shown === 'string' && shown !== '') return shown;
  if (typeof shown === 'number') return String(shown);
  const precision = Number(column.precision);
  const fallback = columnNumber(row, column);
  if (fallback === null) return '—';
  return precision > 0 ? fallback.toFixed(Math.min(precision, 6)) : String(fallback);
}

export function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function handleOf(value) {
  return String(value || '').trim().replace(/^@/, '');
}
