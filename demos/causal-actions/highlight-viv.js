// Tiny tokenizer for .viv source — produces an HTML string with spans.
// Token order matters: comments first, then strings, then keywords / sigils,
// then identifiers and numbers.

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
  "character", "item", "action", "location", "symbol",
  "initiator", "partner", "recipient", "bystander",
  "anywhere", "precast", "spawn", "renames",
];
const KEYWORD_RE = new RegExp(`\\b(${KEYWORDS.join("|")})\\b`, "g");

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Sigil → css class
const SIGIL_CLASS = {
  "@": "sig-at",
  "&": "sig-amp",
  "$": "sig-dollar",
  "~": "sig-tilde",
  "#": "sig-hash",
};

export function highlightViv(src) {
  const lines = src.split(/\r?\n/);
  return lines.map((rawLine, idx) => {
    const lineNo = idx + 1;
    let out = "";
    let line = rawLine;

    // Pull a line comment off the tail, render the head, then append comment span.
    let comment = null;
    const commentIdx = line.indexOf("//");
    if (commentIdx !== -1) {
      // Make sure // isn't inside a string. Cheap check: count quotes.
      const head = line.slice(0, commentIdx);
      const quoteCount = (head.match(/"/g) || []).length;
      if (quoteCount % 2 === 0) {
        comment = line.slice(commentIdx);
        line = head;
      }
    }

    // Tokenise: strings → sigil-prefixed identifiers → keywords → numbers
    // Build using a single sequential pass over the line.
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === '"') {
        // String literal — may contain template gaps which we ignore.
        let j = i + 1;
        while (j < line.length && line[j] !== '"') {
          if (line[j] === "\\" && j + 1 < line.length) j++;
          j++;
        }
        const s = line.slice(i, Math.min(j + 1, line.length));
        out += `<span class="tok-str">${esc(s)}</span>`;
        i = j + 1;
      } else if (SIGIL_CLASS[ch] && /[A-Za-z_*]/.test(line[i + 1] ?? "")) {
        // Sigil-prefixed identifier.
        let j = i + 1;
        while (j < line.length && /[A-Za-z0-9_\-*]/.test(line[j])) j++;
        const sig = ch;
        const ident = line.slice(i + 1, j);
        out += `<span class="${SIGIL_CLASS[sig]} tok-sigil">${esc(sig)}</span>` +
               `<span class="tok-sig-ident ${SIGIL_CLASS[sig]}-ident">${esc(ident)}</span>`;
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
        if (KEYWORDS.includes(word)) {
          out += `<span class="tok-kw">${esc(word)}</span>`;
        } else {
          out += `<span class="tok-ident">${esc(word)}</span>`;
        }
        i = j;
      } else if (ch === ">" && /[A-Za-z_]/.test(line[i + 1] ?? "")) {
        // Plan phase sigil '>foo:'
        let j = i + 1;
        while (j < line.length && /[A-Za-z0-9_\-]/.test(line[j])) j++;
        out += `<span class="tok-phase">${esc(line.slice(i, j))}</span>`;
        i = j;
      } else {
        out += esc(ch);
        i++;
      }
    }

    if (comment) out += `<span class="tok-comment">${esc(comment)}</span>`;

    return (
      `<div class="src-line" id="src-l${lineNo}">` +
        `<span class="src-num">${String(lineNo).padStart(3, " ")}</span>` +
        `<span class="src-text">${out}</span>` +
      `</div>`
    );
  }).join("");
}
