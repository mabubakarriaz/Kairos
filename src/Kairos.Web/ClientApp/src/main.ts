import "./styles/app.css";
import "htmx.org";
import Alpine from "alpinejs";
import "./drag";        // SortableJS drag island (the only bespoke JS)
import "./keybindings"; // Alpine keydown.window handlers
import "./vitals";      // web-vitals reporter (observability-builder wires the OTel metric)

declare global {
  interface Window {
    Alpine: typeof Alpine;
    htmx: typeof import("htmx.org");
  }
}

// Ride the ASP.NET Core antiforgery token on every mutating htmx request.
document.body.addEventListener("htmx:configRequest", (evt) => {
  const token = document.querySelector<HTMLInputElement>('input[name="__RequestVerificationToken"]');
  if (token) (evt as CustomEvent).detail.headers["RequestVerificationToken"] = token.value;
});

window.Alpine = Alpine;
Alpine.start();
