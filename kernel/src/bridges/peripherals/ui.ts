import theme from "../../../../theme.css";
import style from "./ui.css";
import type { AskPermission, PermissionAnswer, PermissionEntry, PermissionScope } from "./permissions";

/** A fixed host-owned surface. Only textContent receives document-supplied labels. */
export function createPermissionUI(entries: () => PermissionEntry[], revoke: (scope: PermissionScope) => void) {
  const container = document.createElement("div");
  const shadow = container.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${theme}\n${style}</style>
    <dialog aria-label="Permissions">
      <h2>Permissions</h2>
      <section id="request" hidden>
        <p id="source"></p>
        <label><input type="checkbox"> Remember this decision</label>
        <div class="actions"><button id="deny" autofocus>Deny</button><button id="allow" class="allow">Allow</button></div>
      </section>
      <section id="manager" hidden>
        <p id="empty">No permissions for currently open pages.</p>
        <table><thead><tr><th scope="col">Site</th><th scope="col">Permission</th><th scope="col">Action</th></tr></thead><tbody></tbody></table>
        <div class="actions"><button id="close">Close</button></div>
      </section>
    </dialog>`;
  const find = <T extends HTMLElement>(selector: string) => shadow.querySelector<T>(selector)!;
  const panel = find<HTMLDialogElement>("dialog");
  const request = find<HTMLElement>("#request");
  const manager = find<HTMLElement>("#manager");
  const remember = find<HTMLInputElement>("input");
  let pending: { resolve: (answer: PermissionAnswer) => void; signal: AbortSignal } | undefined;
  const mount = () => { if (!container.isConnected) document.body.append(container); };
  const label = (scope: Pick<PermissionScope, "source">) =>
    [location.host, ...scope.source.map(({ name }) => name || "Unnamed")].join(" › ");

  function finish(answer: PermissionAnswer = { allow: false, remember: false }) {
    const current = pending;
    pending = undefined;
    current?.signal.removeEventListener("abort", dismiss);
    panel.close();
    current?.resolve(answer);
  }
  const dismiss = () => finish();
  find("#allow").onclick = () => finish({ allow: true, remember: remember.checked });
  find("#deny").onclick = () => finish({ allow: false, remember: remember.checked });
  find("#close").onclick = dismiss;
  panel.addEventListener("cancel", (event) => { event.preventDefault(); dismiss(); });
  // Require both ends of a click on the backdrop; dragging from inside is not denial.
  const outside = (event: MouseEvent) => {
    const rect = panel.getBoundingClientRect();
    return event.target === panel && (event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom);
  };
  let startedOutside = false;
  panel.addEventListener("pointerdown", (event) => { startedOutside = outside(event); });
  panel.addEventListener("click", (event) => { if (startedOutside && outside(event)) dismiss(); startedOutside = false; });

  function renderManager() {
    const rows = entries();
    find("#empty").hidden = rows.length > 0;
    find("table").hidden = rows.length === 0;
    find("tbody").replaceChildren(...rows.map((entry) => {
      const row = document.createElement("tr");
      row.innerHTML = "<td></td><td><span></span><small></small></td><td><button></button></td>";
      row.querySelector("td")!.textContent = label(entry);
      row.querySelector("span")!.textContent = entry.label.charAt(0).toUpperCase() + entry.label.slice(1);
      row.querySelector("small")!.textContent = [entry.allow ? "Allowed" : "Blocked",
        entry.remembered ? "Remembered" : "This request only", entry.active ? "Active request" : ""].filter(Boolean).join(" · ");
      const button = row.querySelector("button")!;
      button.textContent = entry.allow ? "Revoke" : "Forget decision";
      button.setAttribute("aria-label", `${button.textContent}: ${entry.label} for ${label(entry)}`);
      button.onclick = () => revoke(entry);
      return row;
    }));
  }
  const ask: AskPermission = (source, permissions, signal) => {
    if (signal.aborted) return Promise.resolve({ allow: false, remember: false });
    mount();
    panel.classList.remove("manager");
    request.hidden = false;
    manager.hidden = true;
    const names = new Intl.ListFormat("en", { type: "conjunction" }).format(permissions.map(({ label }) => label));
    find("h2").textContent = permissions.length === 1 && permissions[0].capability === "notifications"
      ? "Allow this site to send you notifications?" : `Allow this site to access your ${names}?`;
    find("#source").textContent = label({ source });
    remember.checked = false;
    return new Promise((resolve) => {
      pending = { resolve, signal };
      signal.addEventListener("abort", dismiss, { once: true });
      if (!panel.open) panel.showModal();
    });
  };
  return {
    ask,
    showManager() {
      if (pending) { panel.focus(); return; }
      mount();
      panel.classList.add("manager");
      request.hidden = true;
      manager.hidden = false;
      find("h2").textContent = "Permissions";
      renderManager();
      if (!panel.open) panel.showModal();
    },
    refresh() { if (panel.open && !pending) renderManager(); },
  };
}
