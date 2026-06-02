"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addCalendarAction,
  deleteCalendarAction,
  setCalendarVisibilityAction,
  syncCalendarsAction,
  toggleCalendarAction,
  updateCalendarAction,
} from "@/app/actions";
import { normalizeLabel } from "@/lib/labels";
import type { Calendar } from "@/lib/types";

interface Props {
  calendars: Calendar[];
}

type ActionResult = { ok: boolean; error?: string };

export function CalendarManager({ calendars }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function run(key: string, fn: () => Promise<ActionResult>): Promise<boolean> {
    setError(null);
    setPending(key);
    const res = await fn();
    setPending(null);
    if (!res.ok) {
      setError(res.error ?? "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function sync() {
    setError(null);
    setSyncing(true);
    const res = await syncCalendarsAction();
    setSyncing(false);
    if (!res.ok) setError(res.error ?? "Sync failed.");
    else router.refresh();
  }

  const anyError = calendars.some((c) => c.lastSyncError);

  return (
    <div className="cal-manager">
      <div className="cal-bar">
        <CalendarSummary calendars={calendars} />
        {calendars.length > 0 && (
          <button
            type="button"
            className="cal-sync-btn num"
            onClick={() => void sync()}
            disabled={syncing}
            data-attention={anyError || undefined}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-spin={syncing || undefined}>
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            {syncing ? "syncing…" : "sync now"}
          </button>
        )}
      </div>

      {error && <p className="cal-manager-error num" role="alert">{error}</p>}

      {calendars.length === 0 && !adding ? (
        <p className="cal-empty">
          No calendars attached. Add one to overlay its events on your schedule,
          read-only. Each calendar carries a label you choose.
        </p>
      ) : (
        <ul className="cal-list">
          {calendars.map((cal) =>
            editingId === cal.id ? (
              <li key={cal.id} className="cal-row" data-editing>
                <CalendarForm
                  initial={cal}
                  pending={pending === `save:${cal.id}`}
                  onSubmit={(fd) =>
                    run(`save:${cal.id}`, () => updateCalendarAction(cal.id, fd)).then((ok) => {
                      if (ok) setEditingId(null);
                    })
                  }
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <CalendarRow
                key={cal.id}
                cal={cal}
                pending={pending}
                onEdit={() => {
                  setError(null);
                  setEditingId(cal.id);
                  setAdding(false);
                }}
                onToggle={() =>
                  run(`toggle:${cal.id}`, () => toggleCalendarAction(cal.id, !cal.enabled))
                }
                onToggleVisibility={() =>
                  run(`vis:${cal.id}`, () => setCalendarVisibilityAction(cal.id, !cal.showOnGrid))
                }
                onRemove={() => run(`remove:${cal.id}`, () => deleteCalendarAction(cal.id))}
              />
            ),
          )}
        </ul>
      )}

      {adding ? (
        <div className="cal-add-shell">
          <CalendarForm
            pending={pending === "add"}
            onSubmit={(fd) =>
              run("add", () => addCalendarAction(fd)).then((ok) => {
                if (ok) setAdding(false);
              })
            }
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          className="cal-add-trigger num"
          onClick={() => {
            setError(null);
            setAdding(true);
            setEditingId(null);
          }}
        >
          <span aria-hidden="true">+</span> add calendar
        </button>
      )}
    </div>
  );
}

function CalendarSummary({ calendars }: { calendars: Calendar[] }) {
  if (calendars.length === 0) {
    return <p className="cal-bar-meta num">no calendars</p>;
  }
  const synced = calendars
    .filter((c) => c.enabled && c.lastSyncedAt)
    .map((c) => new Date(c.lastSyncedAt as string).getTime());
  const newest = synced.length ? Math.max(...synced) : null;
  const enabledCount = calendars.filter((c) => c.enabled).length;
  return (
    <p className="cal-bar-meta num" aria-live="polite">
      <span>{enabledCount} synced</span>
      {newest != null && (
        <>
          <span className="cal-bar-sep" aria-hidden="true">·</span>
          <span className="cal-bar-time">{relativeTime(newest)}</span>
        </>
      )}
    </p>
  );
}

function CalendarRow({
  cal,
  pending,
  onEdit,
  onToggle,
  onToggleVisibility,
  onRemove,
}: {
  cal: Calendar;
  pending: string | null;
  onEdit: () => void;
  onToggle: () => void;
  onToggleVisibility: () => void;
  onRemove: () => void;
}) {
  const rowPending = pending != null && pending.endsWith(`:${cal.id}`);
  const hidden = cal.enabled && !cal.showOnGrid;
  return (
    <li className="cal-row" data-disabled={!cal.enabled || undefined} data-hidden={hidden || undefined}>
      <div className="cal-row-main">
        <button
          type="button"
          className="cal-toggle"
          role="switch"
          aria-checked={cal.enabled}
          aria-label={cal.enabled ? `Disable ${cal.name}` : `Enable ${cal.name}`}
          onClick={onToggle}
          disabled={rowPending}
          data-on={cal.enabled || undefined}
        >
          <span className="cal-toggle-knob" />
        </button>
        <div className="cal-row-text">
          <div className="cal-row-line">
            <span className="cal-row-name">{cal.name}</span>
            <span className="cal-row-label num">#{cal.label}</span>
          </div>
          <div className="cal-row-sub num">
            <span className="cal-row-url">{maskUrl(cal.icsUrl)}</span>
            <CalendarStatus cal={cal} />
          </div>
        </div>
      </div>
      <div className="cal-row-actions">
        {cal.enabled && (
          <button
            type="button"
            className="cal-row-eye"
            onClick={onToggleVisibility}
            disabled={rowPending}
            aria-pressed={!cal.showOnGrid}
            aria-label={
              cal.showOnGrid
                ? `Hide #${cal.label} from the grid`
                : `Show #${cal.label} on the grid`
            }
            title={cal.showOnGrid ? "Showing on grid" : "Hidden from grid"}
          >
            {cal.showOnGrid ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2.6 3.2M6.3 7.4A16.7 16.7 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 4-.9" />
                <path d="M10 10a3 3 0 0 0 4 4" />
                <path d="M3 3l18 18" />
              </svg>
            )}
          </button>
        )}
        <button type="button" className="cal-row-edit num" onClick={onEdit} disabled={rowPending}>
          edit
        </button>
        <button
          type="button"
          className="cal-row-remove"
          onClick={onRemove}
          disabled={rowPending}
          aria-label={`Remove ${cal.name}`}
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </li>
  );
}

function CalendarStatus({ cal }: { cal: Calendar }) {
  if (!cal.enabled) return <span className="cal-row-status" data-tone="off">paused</span>;
  if (!cal.showOnGrid) {
    return (
      <span className="cal-row-status" data-tone="muted" title="Synced and counted as busy, but not drawn on the grid">
        hidden from grid
      </span>
    );
  }
  if (cal.lastSyncError) {
    return (
      <span className="cal-row-status" data-tone="error" title={cal.lastSyncError}>
        {shorten(cal.lastSyncError)}
      </span>
    );
  }
  if (cal.lastSyncedAt) {
    return <span className="cal-row-status">synced {relativeTime(new Date(cal.lastSyncedAt).getTime())}</span>;
  }
  return <span className="cal-row-status" data-tone="muted">not synced yet</span>;
}

function CalendarForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: Calendar;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [url, setUrl] = useState(initial?.icsUrl ?? "");
  const nameRef = useRef<HTMLInputElement>(null);

  function submit() {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("label", normalizeLabel(label) ?? label);
    fd.set("icsUrl", url);
    onSubmit(fd);
  }

  return (
    <form
      className="cal-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="cal-form-row">
        <input
          ref={nameRef}
          autoFocus
          className="cal-form-name"
          placeholder="Calendar name (e.g. Work)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          disabled={pending}
          aria-label="Calendar name"
        />
        <span className="cal-form-sigil num" aria-hidden="true">#</span>
        <input
          className="cal-form-label num"
          placeholder="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={24}
          spellCheck={false}
          disabled={pending}
          aria-label="Label for this calendar's events"
        />
      </div>
      <input
        className="cal-form-url num"
        placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        disabled={pending}
        aria-label="Secret address in iCal format"
      />
      <div className="cal-form-actions">
        <button type="submit" className="cal-form-save num" disabled={pending}>
          {pending ? "saving…" : initial ? "↵ save" : "↵ attach"}
        </button>
        <button type="button" className="cal-form-cancel num" onClick={onCancel} disabled={pending}>
          cancel
        </button>
        <span className="cal-form-hint num">read-only · syncs on a 10-min refresh</span>
      </div>
    </form>
  );
}

/** Show host + a hint of the path, never the full secret token. */
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}/…/basic.ics`;
  } catch {
    return "iCal feed";
  }
}

function shorten(msg: string): string {
  return msg.length > 42 ? `${msg.slice(0, 41)}…` : msg;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
