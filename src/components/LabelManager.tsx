"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearBudgetAction,
  registerLabelAction,
  removeLabelAction,
  setBudgetAction,
} from "@/app/actions";
import { normalizeLabel } from "@/lib/labels";
import { BUDGET_PERIODS, PERIOD_LABEL, PERIOD_SUFFIX } from "@/lib/budgets";
import type { BudgetPeriod, Label } from "@/lib/types";

interface Props {
  labels: Label[];
  untracked: string[];
}

export function LabelManager({ labels, untracked }: Props) {
  const router = useRouter();
  const addRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
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

  async function addLabel() {
    const slug = normalizeLabel(draft);
    if (!slug) {
      setError("Use a short label: letters, digits, - or _.");
      addRef.current?.focus();
      return;
    }
    const ok = await run("add", () => registerLabelAction(slug));
    if (ok) {
      setDraft("");
      addRef.current?.focus();
    }
  }

  return (
    <div className="label-manager">
      <form
        className="label-add"
        onSubmit={(e) => {
          e.preventDefault();
          void addLabel();
        }}
      >
        <span className="label-add-sigil num" aria-hidden="true">#</span>
        <input
          ref={addRef}
          className="label-add-input"
          placeholder="new label"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          maxLength={24}
          disabled={pending === "add"}
          aria-label="New label"
        />
        <span className="label-add-hint num">{pending === "add" ? "saving…" : "↵ add"}</span>
      </form>

      {error && (
        <p className="label-manager-error num" role="alert">{error}</p>
      )}

      {labels.length === 0 ? (
        <p className="label-empty">
          No labels yet. Add one above, or type a label on any task and it will
          surface here to track.
        </p>
      ) : (
        <ul className="label-list">
          {labels.map((label) => (
            <LabelRow
              key={label.slug}
              label={label}
              isEditing={editing === label.slug}
              pending={pending}
              onEdit={() => setEditing(label.slug)}
              onCloseEdit={() => setEditing(null)}
              onSave={(hours, period) =>
                run(`budget:${label.slug}`, () => setBudgetAction(label.slug, hours, period)).then(
                  (ok) => {
                    if (ok) setEditing(null);
                  },
                )
              }
              onClear={() =>
                run(`clear:${label.slug}`, () => clearBudgetAction(label.slug)).then((ok) => {
                  if (ok) setEditing(null);
                })
              }
              onRemove={() => run(`remove:${label.slug}`, () => removeLabelAction(label.slug))}
            />
          ))}
        </ul>
      )}

      {untracked.length > 0 && (
        <div className="label-untracked">
          <p className="label-untracked-head num">in use, not yet added</p>
          <div className="label-untracked-row">
            {untracked.map((slug) => (
              <button
                key={slug}
                type="button"
                className="label-untracked-pill num"
                onClick={() => void run(`add:${slug}`, () => registerLabelAction(slug))}
                disabled={pending === `add:${slug}`}
                aria-label={`Add ${slug} to settings`}
              >
                #{slug}
                <span className="label-untracked-plus" aria-hidden="true">+</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LabelRow({
  label,
  isEditing,
  pending,
  onEdit,
  onCloseEdit,
  onSave,
  onClear,
  onRemove,
}: {
  label: Label;
  isEditing: boolean;
  pending: string | null;
  onEdit: () => void;
  onCloseEdit: () => void;
  onSave: (hours: string, period: BudgetPeriod) => void;
  onClear: () => void;
  onRemove: () => void;
}) {
  const budgeted = label.budgetHours != null && label.budgetPeriod != null;
  const rowPending = pending != null && pending.endsWith(`:${label.slug}`);

  return (
    <li className="label-row" data-editing={isEditing || undefined}>
      <div className="label-row-main">
        <span className="label-row-tag num">#{label.slug}</span>
        {isEditing ? (
          <BudgetEditor label={label} pending={rowPending} onSave={onSave} onClear={onClear} onCancel={onCloseEdit} />
        ) : (
          <>
            <button
              type="button"
              className="label-row-budget num"
              onClick={onEdit}
              data-set={budgeted || undefined}
            >
              {budgeted
                ? `${label.budgetHours}h ${PERIOD_SUFFIX[label.budgetPeriod as BudgetPeriod]}`
                : "set budget"}
            </button>
            <button
              type="button"
              className="label-row-remove"
              onClick={onRemove}
              disabled={rowPending}
              aria-label={`Remove ${label.slug}`}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function BudgetEditor({
  label,
  pending,
  onSave,
  onClear,
  onCancel,
}: {
  label: Label;
  pending: boolean;
  onSave: (hours: string, period: BudgetPeriod) => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const budgeted = label.budgetHours != null && label.budgetPeriod != null;
  const [hours, setHours] = useState(budgeted ? String(label.budgetHours) : "");
  const [period, setPeriod] = useState<BudgetPeriod>(
    (label.budgetPeriod as BudgetPeriod | null) ?? "week",
  );
  const hoursRef = useRef<HTMLInputElement>(null);

  function submit() {
    onSave(hours, period);
  }

  return (
    <form
      className="budget-editor"
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
      <input
        ref={hoursRef}
        autoFocus
        className="budget-editor-hours num"
        value={hours}
        onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ""))}
        inputMode="decimal"
        placeholder="0"
        aria-label="Budget hours"
        disabled={pending}
        maxLength={7}
      />
      <span className="budget-editor-unit num" aria-hidden="true">h</span>
      <div className="budget-editor-periods" role="group" aria-label="Budget period">
        {BUDGET_PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            className="budget-period-chip"
            data-active={period === p || undefined}
            onClick={() => setPeriod(p)}
            disabled={pending}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="budget-editor-actions">
        <button type="submit" className="budget-editor-save num" disabled={pending}>
          {pending ? "saving…" : "↵ save"}
        </button>
        {budgeted && (
          <button type="button" className="budget-editor-clear num" onClick={onClear} disabled={pending}>
            clear
          </button>
        )}
        <button type="button" className="budget-editor-cancel" onClick={onCancel} aria-label="Cancel">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </form>
  );
}
