export function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// "2026.04.04" — used in the main-view header. Stable, unambiguous, and looks
// nice in monospace.
export function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// "May 29, 2026" — human-readable date for the title slide. Parses the ISO
// date parts directly (no timezone shift) and falls back to the raw string.
export function fmtDateLong(iso?: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, day] = m;
  const monthIdx = Number(mo) - 1;
  const dayNum = Number(day);
  const month = MONTHS[monthIdx];
  if (!month || dayNum < 1 || dayNum > 31) return iso;
  return `${month} ${dayNum}, ${y}`;
}
