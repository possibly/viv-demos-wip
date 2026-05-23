// Inline .viv syntax highlighter for the IDE editor.
//
// Emits a single HTML string with newlines preserved (no per-line wrapper divs),
// so it can sit underneath a transparent <textarea> as a highlight overlay and
// stay pixel-aligned with the text the user types.

const KEYWORDS = [
  "reserved", "template", "action", "action-selector", "plan", "plan-selector",
  "query", "pattern", "trope", "include",
  "roles", "conditions", "effects", "reactions", "tags", "gloss", "report",
  "importance", "saliences", "associations", "embargoes", "scratch",
  "phases", "target", "actions", "ancestors", "descendants",
  "queue", "with", "from", "is", "as", "n", "join",
  "loop", "end", "if", "elif", "else", "for",
  "caused", "triggered", "preceded", "in", "knows", "inscribe", "inspect",
  "search", "sift", "partial", "none", "any", "all", "exactly",
  "after", "before", "between", "and", "ago",
  "urgent", "priority", "location", "time", "abandon", "repeat", "wait",
  "max", "until", "timeout", "advance", "succeed", "fail",
  "over", "inherit", "chronicle",
  "minute", "minutes", "hour", "hours", "day", "days",
  "week", "weeks", "month", "months", "year", "years",
  "true", "false", "null",
  "character", "item", "location", "symbol",
  "initiator", "partner", "recipient", "bystander",
  "anywhere", "precast", "spawn", "renames",
];
const KEYWORD_SET = new Set(KEYWORDS);

const SIGIL_CLASS = {
  "@": "sig-at",
  "&": "sig-amp",
  "$": "sig-dollar",
  "~": "sig-tilde",
  "#": "sig-hash",
};

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tokenizeLine(rawLine) {
  let line = rawLine;
  let out = "";

  // Pull a trailing line comment off (unless it sits inside a string literal).
  let comment = null;
  const commentIdx = line.indexOf("//");
  if (commentIdx !== -1) {
    const head = line.slice(0, commentIdx);
    if ((head.match(/"/g) || []).length % 2 === 0) {
      comment = line.slice(commentIdx);
      line = head;
    }
  }

  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') {
        if (line[j] === "\\" && j + 1 < line.length) j++;
        j++;
      }
      const s = line.slice(i, Math.min(j + 1, line.length));
      out += `<span class="tok-str">${esc(s)}</span>`;
      i = j + 1;
    } else if (SIGIL_CLASS[ch] && /[A-Za-z_*]/.test(line[i + 1] ?? "")) {
      let j = i + 1;
      while (j < line.length && /[A-Za-z0-9_\-*]/.test(line[j])) j++;
      const ident = line.slice(i + 1, j);
      out += `<span class="${SIGIL_CLASS[ch]} tok-sigil">${esc(ch)}</span>` +
             `<span class="tok-sig-ident ${SIGIL_CLASS[ch]}-ident">${esc(ident)}</span>`;
      i = j;
    } else if (ch === ">" && /[A-Za-z_]/.test(line[i + 1] ?? "")) {
      let j = i + 1;
      while (j < line.length && /[A-Za-z0-9_\-]/.test(line[j])) j++;
      out += `<span class="tok-phase">${esc(line.slice(i, j))}</span>`;
      i = j;
    } else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < line.length && /[0-9.]/.test(line[j])) j++;
      out += `<span class="tok-num">${esc(line.slice(i, j))}</span>`;
      i = j;
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < line.length && /[A-Za-z0-9_\-]/.test(line[j])) j++;
      const word = line.slice(i, j);
      out += KEYWORD_SET.has(word)
        ? `<span class="tok-kw">${esc(word)}</span>`
        : `<span class="tok-ident">${esc(word)}</span>`;
      i = j;
    } else {
      out += esc(ch);
      i++;
    }
  }

  if (comment) out += `<span class="tok-comment">${esc(comment)}</span>`;
  return out;
}

export function highlightVivInline(src) {
  return src.split("\n").map(tokenizeLine).join("\n");
}
