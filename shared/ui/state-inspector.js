export class StateInspector {
  #el;

  constructor() {
    this.#el = document.createElement("div");
    this.#el.className = "viv-state-inspector";
  }

  get element() { return this.#el; }

  update(state) {
    this.#el.innerHTML = "";
    this.#el.appendChild(renderValue(state, 0));
  }
}

function renderValue(val, depth) {
  if (val === null || val === undefined) return text(String(val), "viv-si__null");
  if (typeof val === "boolean") return text(String(val), "viv-si__bool");
  if (typeof val === "number") return text(String(val), "viv-si__num");
  if (typeof val === "string") return text(JSON.stringify(val), "viv-si__str");
  if (Array.isArray(val)) return renderArray(val, depth);
  if (typeof val === "object") return renderObject(val, depth);
  return text(String(val));
}

function renderObject(obj, depth) {
  const keys = Object.keys(obj);
  if (keys.length === 0) return text("{}");
  const el = document.createElement("details");
  el.open = depth < 2;
  const summary = document.createElement("summary");
  summary.textContent = `{${keys.length}}`;
  el.appendChild(summary);
  for (const k of keys) {
    const row = document.createElement("div");
    row.style.paddingLeft = "1em";
    const key = document.createElement("span");
    key.className = "viv-si__key";
    key.textContent = k + ": ";
    row.appendChild(key);
    row.appendChild(renderValue(obj[k], depth + 1));
    el.appendChild(row);
  }
  return el;
}

function renderArray(arr, depth) {
  if (arr.length === 0) return text("[]");
  const el = document.createElement("details");
  el.open = depth < 2;
  const summary = document.createElement("summary");
  summary.textContent = `[${arr.length}]`;
  el.appendChild(summary);
  arr.forEach((item, i) => {
    const row = document.createElement("div");
    row.style.paddingLeft = "1em";
    const idx = document.createElement("span");
    idx.className = "viv-si__key";
    idx.textContent = i + ": ";
    row.appendChild(idx);
    row.appendChild(renderValue(item, depth + 1));
    el.appendChild(row);
  });
  return el;
}

function text(str, cls) {
  const el = document.createElement("span");
  if (cls) el.className = cls;
  el.textContent = str;
  return el;
}
