# AI Integration (MCP) — Technology Stack (Kairos)

> The **AI Integration (MCP)** slice of the canonical Kairos stack, owned by the `mcp-builder` skill.
> Indexed in [docs/technology-stack.md](../../../../docs/technology-stack.md); rationale, benchmarks & rejected alternatives in [docs/research.md](../../../../docs/research.md). Cross-cutting decisions — the architecture diagram and the [_Deliberately Excluded_](../../../../docs/technology-stack.md#deliberately-excluded) list — live in the index. Patterns for this slice: [design-pattern.md](design-pattern.md).

## AI Integration (MCP)

| Technology | Purpose | Notes |
|---|---|---|
| **Model Context Protocol (MCP)** | Expose Kairos to AI agents | Lets AI clients read tasks and add/remove/update/reschedule items, and query free slots |
| **`ModelContextProtocol`** (C# SDK, 1.x) | Build the MCP server in .NET | Official SDK (Microsoft + Anthropic); handles JSON-RPC framing & tool discovery. **Pin the version** — spec & SDK are still moving |
| **`ModelContextProtocol.AspNetCore`** | Hosting transport for MCP | `AddMcpServer().WithHttpTransport().WithToolsFromAssembly()` + `app.MapMcp("/mcp")`; Streamable HTTP / SSE |

> The MCP server publishes **tools** (`create_task`, `delete_task`, `list_tasks`, `reschedule_task`, `list_free_slots`) and **resources** so an AI assistant can manage Kairos content conversationally — including "what free slots do I have tomorrow?" and "schedule X for 1 h tomorrow morning."

> **Topology:** MCP runs **in the same process as the app** — `/mcp` is a route inside `Kairos.Web`. There is **no separate `Kairos.Mcp` project, container, or `mcp` Aspire resource.** The tool classes live under `Kairos.Web/Mcp/` and delegate to the same `Kairos.Application` services the Razor PageModels use.

---

_Derived from the canonical Kairos stack. If anything here conflicts with [docs/technology-stack.md](../../../../docs/technology-stack.md), the index wins; update this slice to match._
