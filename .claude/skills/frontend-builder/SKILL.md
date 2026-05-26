---
name: frontend-builder
description: "Build the Kairos frontend — ASP.NET Core Razor Pages styled with Tailwind CSS, made interactive with htmx + Alpine.js, and bundled with Vite. Use when the user asks to create, scaffold, style, or wire up Razor Pages, layouts/partials, htmx-driven partial updates, Alpine components, the Tailwind/Vite asset pipeline, or wwwroot static assets for Kairos."
---

# frontend-builder

Build the Kairos frontend exactly as specified in [docs/technology-stack.md](../../../docs/technology-stack.md). This skill is the procedural companion to that document for the UI layer: the tech-stack doc decides *what* the frontend stack is, this skill decides *how* to assemble it consistently. It is the counterpart to the `backend-builder` skill — the frontend consumes the Minimal API / Razor Page handlers that `backend-builder` produces.

**Read [docs/technology-stack.md](../../../docs/technology-stack.md) first** — it is the source of truth. If anything here conflicts with it, the tech-stack doc wins; update this skill to match.

## Canonical frontend stack (from the tech-stack doc)

- **View layer:** ASP.NET Core **Razor Pages** — server-rendered, the source of truth for markup
- **Styling:** **Tailwind CSS** — utility-first, compiled via the Tailwind CLI / PostCSS
- **Server-driven interactivity:** **htmx** — partial updates without a SPA
- **Client-only behaviors:** **Alpine.js** — dropdowns, toggles, modals, small reactive bits
- **Asset pipeline:** **Vite** — bundles/minifies CSS + JS, HMR in dev
- **Runtime/host:** .NET 10 ASP.NET Core (`Kairos.Web`), wired through .NET Aspire

> **Guiding principle:** Razor Pages stays authoritative on the server. Tailwind styles, htmx fetches server-rendered partials, Alpine handles purely client-side state. No heavy SPA framework.

## Target layout (inside `src/Kairos.Web`)

```
src/Kairos.Web/
  Pages/
    Shared/
      _Layout.cshtml            # base layout, references built assets
      _ValidationScriptsPartial.cshtml
      Partials/                 # htmx-returnable partial views (e.g. _TaskRow.cshtml, _TaskList.cshtml)
    Tasks/
      Index.cshtml(.cs)         # list + create
      Edit.cshtml(.cs)
    Index.cshtml(.cs)
  ClientApp/                    # front-end source (compiled by Vite → wwwroot)
    src/
      main.ts                   # entry: imports css, registers htmx + Alpine
      styles/app.css            # Tailwind directives (@tailwind base/components/utilities)
      components/               # Alpine component definitions
    package.json
    vite.config.ts
    tailwind.config.js
    postcss.config.js
  wwwroot/                      # Vite build output (git-ignored) + static files
  Kairos.Web.csproj             # hooks npm build into dotnet build/publish
```

## Build workflow

Work one page/feature at a time, vertically: render server markup → style with Tailwind → add htmx partial update → layer Alpine only if needed. Run `npm run build` and `dotnet build` after wiring the pipeline; don't batch failures.

### 1. Scaffold the front-end toolchain
From `src/Kairos.Web/ClientApp`:
```powershell
npm create vite@latest . -- --template vanilla-ts
npm install -D tailwindcss postcss autoprefixer
npm install htmx.org alpinejs
npx tailwindcss init -p
```
- `tailwind.config.js` — set `content` to scan Razor markup so classes aren't purged:
  ```js
  content: ["../Pages/**/*.cshtml", "./src/**/*.{ts,js}"]
  ```
- `src/styles/app.css`:
  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
  ```
- `src/main.ts` — wire the libraries:
  ```ts
  import "./styles/app.css";
  import "htmx.org";
  import Alpine from "alpinejs";
  window.Alpine = Alpine;
  Alpine.start();
  ```

### 2. Configure Vite output for ASP.NET
- In `vite.config.ts`, emit a manifest and build into the web project's `wwwroot`:
  ```ts
  build: {
    manifest: true,
    outDir: "../wwwroot",
    emptyOutDir: false,
    rollupOptions: { input: "src/main.ts" },
  }
  ```
- Reference assets from `_Layout.cshtml` via the Vite manifest. In dev, point at the Vite dev server (HMR); in production, read hashed filenames from `manifest.json`. The `Vite.AspNetCore` package handles dev-server proxying + manifest lookup with a tag helper, or read the manifest manually in a small helper.
- npm scripts in `ClientApp/package.json`: `"dev": "vite"`, `"build": "vite build"`.

### 3. Hook the asset build into dotnet
In `Kairos.Web.csproj`, run the npm build before publish so containers/CI produce assets:
```xml
<Target Name="BuildClientApp" BeforeTargets="Build" Condition="'$(Configuration)' == 'Release'">
  <Exec Command="npm install" WorkingDirectory="ClientApp" />
  <Exec Command="npm run build" WorkingDirectory="ClientApp" />
</Target>
```
Add `ClientApp/node_modules` and the Vite-built `wwwroot` artifacts to `.gitignore`.

### 4. Layout & base markup
- `_Layout.cshtml`: HTML shell, `<head>` references the Vite-built CSS/JS, semantic landmarks, and a content `@RenderBody()`. Apply Tailwind utility classes for the shell (nav, container, theme).
- Keep a consistent design language with Tailwind (spacing scale, a small set of component classes via `@layer components` for buttons/cards/inputs).

### 5. Pages
- One Razor Page per view under `Pages/`; PageModel handlers (`OnGet`, `OnPost`, named handlers `OnPostDelete` etc.) call the backend application services / Minimal APIs — never embed business logic in the page.
- Build the core Kairos task UX: list tasks, create/edit, reschedule, complete, delete.

### 6. htmx — server-driven partial updates
- Put reusable fragments in `Pages/Shared/Partials/` (e.g. `_TaskList.cshtml`, `_TaskRow.cshtml`).
- Trigger updates with htmx attributes: `hx-get`, `hx-post`, `hx-target`, `hx-swap`. Example: a "complete" button does `hx-post` to a handler and swaps the returned `_TaskRow` partial.
- In the PageModel, detect htmx requests and return only the partial:
  ```csharp
  if (Request.Headers.ContainsKey("HX-Request"))
      return Partial("Partials/_TaskList", model);
  return Page();
  ```
- Send the antiforgery token with htmx posts (configure `hx-headers` or a global config). Use `HX-Trigger`/`HX-Redirect` response headers for post-action events.

### 7. Alpine.js — client-only behaviors
- Use Alpine **only** for state that doesn't need the server: open/close menus, modals, tab state, optimistic UI toggles.
- Register richer behaviors as components in `ClientApp/src/components/` and reference with `x-data="taskForm()"`. Keep markup the source of truth; don't rebuild data the server already renders.

### 8. Accessibility, responsiveness & progressive enhancement
- Mobile-first Tailwind responsive utilities; ensure the app is usable without JavaScript where feasible (forms post normally; htmx enhances).
- Semantic HTML, labelled inputs, focus states, keyboard navigation, and sensible color contrast.

### 9. Containerization
- The `Kairos.Web` Dockerfile must build front-end assets: a multi-stage build with a Node stage (`npm ci && npm run build`) feeding the published `wwwroot`, then the .NET runtime stage. Keep service name/ports aligned with `docker-compose.yml` and the architecture diagram in the tech-stack doc.

### 10. Tests (optional but recommended)
- Razor Page handler tests with xUnit (consistent with `backend-builder`).
- End-to-end UI smoke tests (e.g. Playwright) covering the htmx flows — list, create, complete, delete.

## Conventions

- **Server authoritative.** Markup and data come from Razor Pages; htmx swaps server-rendered partials; Alpine is for ephemeral client state only.
- **No business logic in PageModels** — they call the same application services the backend/MCP use.
- **Tailwind, not custom CSS.** Compose utilities; promote repeated patterns into `@layer components` classes rather than ad-hoc stylesheets.
- **Partials are the swap unit.** Anything htmx can replace lives in `Pages/Shared/Partials/`.
- **Antiforgery on every mutating htmx request.**
- **Assets are built, never hand-edited in `wwwroot`** — edit `ClientApp/src`, let Vite produce output.
- After wiring the pipeline: `npm run build` + `dotnet build` clean before declaring done.

## Definition of done

A frontend change is complete when: `npm run build` and `dotnet build` succeed, pages render with Tailwind styling applied, htmx partial updates work against the backend handlers, Alpine behaviors function, antiforgery is enforced on mutations, the app is responsive/accessible, and the `Kairos.Web` container builds with assets included. Anything skipped is called out explicitly.
