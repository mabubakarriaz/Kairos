// Keyboard map for the schedule view (a subset of the research report's full map for the MVP):
//   j / k  → previous / next day      t → today
//   n      → focus the "new task" form
//   ?      → toggle the shortcut cheatsheet
// Registered globally; ignores keystrokes while typing in a field.

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

function shiftDay(days: number): void {
  const params = new URLSearchParams(window.location.search);
  const base = params.get("date");
  const d = base ? new Date(base + "T00:00:00") : new Date();
  d.setDate(d.getDate() + days);
  params.set("date", d.toISOString().slice(0, 10));
  window.location.search = params.toString();
}

window.addEventListener("keydown", (e) => {
  if (isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;

  switch (e.key) {
    case "j": shiftDay(-1); break;
    case "k": shiftDay(1); break;
    case "t": window.location.search = ""; break; // today
    case "n":
      e.preventDefault();
      document.querySelector<HTMLInputElement>("#new-task-title")?.focus();
      break;
    case "?":
      document.getElementById("cheatsheet")?.toggleAttribute("hidden");
      break;
  }
});
