/**
 * Post-activity ("after") vitals for height-pass style forms.
 * The offset is derived from a per-patient seed rather than Math.random so a
 * re-exported PDF always shows the same after-values as the previous export.
 */
const OFFSETS = [2, 6, 8, 12];

function pickOffset(seed, salt) {
  const key = `${seed || ""}:${salt}`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 1000003;
  }
  return OFFSETS[hash % OFFSETS.length];
}

function calculateAfterPulse(val, seed) {
  const pulse = parseInt(val, 10);
  if (Number.isNaN(pulse)) return "";
  return String(pulse + pickOffset(seed, "pulse"));
}

function calculateAfterBp(bpString, seed) {
  if (!bpString) return "";
  const matchSlash = String(bpString).match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!matchSlash) return "";
  const offset = pickOffset(seed, "bp");
  const sys = parseInt(matchSlash[1], 10) + offset;
  const dia = parseInt(matchSlash[2], 10) + offset;
  return `${sys}/${dia}`;
}

module.exports = {
  calculateAfterPulse,
  calculateAfterBp
};
