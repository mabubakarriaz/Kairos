# Project memory

Version-controlled project memory for Kairos. These files capture durable project
context (decisions, the live-deployment facts, the UI design language) that isn't
obvious from the code alone.

They are loaded into Claude Code's context **every session** because `CLAUDE.md`
imports them with `@.claude/memory/…` lines. Keep each file short and factual.

This is the **canonical** project memory (committed, travels with the repo) — it
replaces Claude Code's machine-local auto-memory store for this project. When you
learn something durable about the project, add or update a file here.
