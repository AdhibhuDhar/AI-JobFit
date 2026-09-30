// HTML -> plain text.
//
// This is regex-based, not spec-compliant parsing. That is acceptable ONLY
// because the output has exactly two consumers: a Gemini prompt, and Angular
// interpolation on the frontend (which auto-escapes). The moment anyone
// renders a job description with [innerHTML], this must be replaced with a real
// parser. Do not "improve" it into something that emits markup.

const MAX_CHARS = 20000;

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#039': "'",
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', bull: '•', middot: '·', trade: '™',
  reg: '®', copy: '©', eacute: 'é', deg: '°', euro: '€', pound: '£',
};

function decodeEntities(str) {
  return str.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code) => {
    const key = code.toLowerCase();
    if (ENTITIES[key] !== undefined) return ENTITIES[key];
    if (key.startsWith('#x')) {
      const n = parseInt(key.slice(2), 16);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    if (key.startsWith('#')) {
      const n = parseInt(key.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return match;
  });
}

function stripHtml(input) {
  if (typeof input !== 'string') return '';
  let text = input;

  // Drop elements whose contents are never prose.
  text = text.replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, ' ');
  // Unclosed variants (e.g. a bare <script src=...>).
  text = text.replace(/<(script|style)\b[^>]*>[\s\S]*$/gi, ' ');
  // Block-level tags become line breaks so sentences don't run together.
  text = text.replace(/<\/?(p|div|br|li|ul|ol|tr|h[1-6]|section|article|header|footer|table)\b[^>]*>/gi, '\n');
  // Everything else is just removed.
  text = text.replace(/<[^>]+>/g, ' ');

  text = decodeEntities(text);
  text = text.replace(/[ \t\f\v]+/g, ' ');
  text = text.replace(/ *\n */g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/** Strip, collapse to a single line, and cap — best for Gemini prompt input. */
function toPromptText(input, maxChars = MAX_CHARS) {
  const flat = stripHtml(input).replace(/\s+/g, ' ').trim();
  if (flat.length <= maxChars) return flat;
  return `${flat.slice(0, maxChars)} … [truncated]`;
}

module.exports = { stripHtml, toPromptText, decodeEntities };
