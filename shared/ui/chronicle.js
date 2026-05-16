export class Chronicle {
  #el;
  #entries = [];
  #maxEntries;

  constructor({ maxEntries = 200 } = {}) {
    this.#maxEntries = maxEntries;
    this.#el = document.createElement("div");
    this.#el.className = "viv-chronicle";
    this.#el.style.cssText = "height:100%;overflow-y:auto;white-space:pre-wrap;word-break:break-all;";
  }

  get element() { return this.#el; }

  append(entry) {
    this.#entries.push(entry);
    if (this.#entries.length > this.#maxEntries) {
      this.#entries.shift();
      this.#el.firstChild?.remove();
    }
    const line = document.createElement("div");
    line.className = "viv-chronicle__entry";
    line.textContent = typeof entry === "string" ? entry : JSON.stringify(entry);
    this.#el.appendChild(line);
    this.#el.scrollTop = this.#el.scrollHeight;
  }

  clear() {
    this.#entries = [];
    this.#el.innerHTML = "";
  }
}
