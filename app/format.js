// Formatting for API values, and the tiny markup helpers the views share. Every helper returns a
// string: a view builds its HTML once and the router patches the stage, so a nav does not rebuild.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text made safe to put inside HTML, attribute values included. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/** A dollar amount ('682.00', 0.5, null) as '$682', '$0.50' or '—'. */
export function usd(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** A plain integer with thousands separators: 11544 -> '11,544'. */
export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '—';
}

/** Compactly: '8.2k', '1.3M'. For entry counts where the digits are noise. */
export function compact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n < 1000) return String(n);
  if (n < 1e6) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

/** A date in UTC: '17 Nov 2026, 12:30 UTC'. */
export function utcDate(iso) {
  const d = new Date(iso ?? NaN);
  if (Number.isNaN(d.getTime())) return '—';
  const s = d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  });
  return `${s} UTC`;
}

/** The day alone: '17 Nov 2026'. */
export function utcDay(iso) {
  const d = new Date(iso ?? NaN);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Milliseconds until an ISO time; negative once it has passed. */
export function msLeft(iso) {
  const t = new Date(iso ?? NaN).getTime();
  return Number.isNaN(t) ? -1 : t - Date.now();
}

/** Every part of the time left, so a view can pick what to show. */
export function remaining(iso) {
  const ms = msLeft(iso);
  if (ms <= 0) return { ended: true, text: 'ended', short: 'ended', urgent: false };
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const text = days > 0 ? `${days}d ${hours}h left` : hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
  const short = days > 0 ? `${days}d` : hours > 0 ? `${hours}h` : `${minutes}m`;
  return { ended: false, text, short, urgent: days < 1 };
}

/** The time left as words: '2d 4h left', '35m left' or 'ended'. */
export function timeLeft(iso) {
  return remaining(iso).text;
}

/** A bounty past its deadline takes no entries, whatever its status still says. */
export function acceptsEntries(bounty) {
  if (typeof bounty?.acceptingSubmissions === 'boolean') return bounty.acceptingSubmissions;
  return msLeft(bounty?.deadline) > 0;
}

/** Markdown made safe: headings, lists, bold, code and links; everything else escaped. */
export function markdown(src) {
  if (!src) return '';
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" rel="noopener noreferrer">$2</a>');
  const out = [];
  let list = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of String(src).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const tag = `h${Math.min(4, heading[1].length + 1)}`;
      out.push(`<${tag}>${inline(heading[2])}</${tag}>`);
    } else if (bullet) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

/** Whether a status chip is worth colouring, and how. */
export function phaseTone(status) {
  if (status === 'open') return 'live';
  if (status === 'resolved' || status === 'closed') return 'done';
  return 'quiet';
}
