import { Chronicle } from "./chronicle.js";
import { StateInspector } from "./state-inspector.js";

export class DebugPanel {
  #panel;
  #chronicle;
  #inspector;
  #collapsed = false;
  #activeTab = "chronicle";

  constructor({ toggleKey = "`" } = {}) {
    this.#chronicle = new Chronicle();
    this.#inspector = new StateInspector();
    this.#panel = this.#build();
    document.body.appendChild(this.#panel);

    document.addEventListener("keydown", (e) => {
      if (e.key === toggleKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.toggle();
      }
    });
  }

  #build() {
    const panel = document.createElement("div");
    panel.className = "viv-debug-panel";

    const header = document.createElement("div");
    header.className = "viv-debug-panel__header";
    header.innerHTML = `<span>viv debug</span><span class="viv-debug-panel__toggle">▾</span>`;
    header.addEventListener("click", () => this.toggle());

    const tabs = document.createElement("div");
    tabs.className = "viv-debug-panel__tabs";
    for (const id of ["chronicle", "state"]) {
      const tab = document.createElement("div");
      tab.className = "viv-debug-panel__tab" + (id === this.#activeTab ? " active" : "");
      tab.textContent = id;
      tab.dataset.tab = id;
      tab.addEventListener("click", () => this.#switchTab(id));
      tabs.appendChild(tab);
    }

    const content = document.createElement("div");
    content.className = "viv-debug-panel__content";

    const chroniclePane = document.createElement("div");
    chroniclePane.className = "viv-debug-panel__pane" + (this.#activeTab === "chronicle" ? " active" : "");
    chroniclePane.dataset.pane = "chronicle";
    chroniclePane.appendChild(this.#chronicle.element);

    const statePane = document.createElement("div");
    statePane.className = "viv-debug-panel__pane" + (this.#activeTab === "state" ? " active" : "");
    statePane.dataset.pane = "state";
    statePane.appendChild(this.#inspector.element);

    content.appendChild(chroniclePane);
    content.appendChild(statePane);
    panel.appendChild(header);
    panel.appendChild(tabs);
    panel.appendChild(content);
    return panel;
  }

  #switchTab(id) {
    this.#activeTab = id;
    this.#panel.querySelectorAll(".viv-debug-panel__tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === id);
    });
    this.#panel.querySelectorAll(".viv-debug-panel__pane").forEach((p) => {
      p.classList.toggle("active", p.dataset.pane === id);
    });
  }

  toggle() {
    this.#collapsed = !this.#collapsed;
    this.#panel.classList.toggle("collapsed", this.#collapsed);
    const arrow = this.#panel.querySelector(".viv-debug-panel__toggle");
    if (arrow) arrow.textContent = this.#collapsed ? "▸" : "▾";
  }

  logEvent(entry) { this.#chronicle.append(entry); }

  updateState(state) { this.#inspector.update(state); }
}
