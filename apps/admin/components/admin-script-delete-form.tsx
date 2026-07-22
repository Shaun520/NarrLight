"use client";

import { Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteAdminScripts } from "@/app/(admin)/scripts/actions";

const FORM_ID = "admin-script-delete-form";

export function AdminScriptDeleteForm({
  returnTo,
  children,
}: {
  returnTo: string;
  children: ReactNode;
}) {
  const [selectedCount, setSelectedCount] = useState(0);

  return (
    <form
      action={deleteAdminScripts}
      id={FORM_ID}
      onChange={(event) => {
        setSelectedCount(countSelectedScripts(event.currentTarget));
      }}
      onSubmit={(event) => {
        const submitter = event.nativeEvent.submitter;
        const mode = submitter instanceof HTMLButtonElement ? submitter.value : "bulk";
        const count = mode.startsWith("single:") ? 1 : countSelectedScripts(event.currentTarget);
        const message =
          count > 1
            ? `确认删除选中的 ${count} 个剧本？关联角色、幕、线索、任务和插画数据会一并删除，且不可恢复。`
            : "确认删除该剧本？关联角色、幕、线索、任务和插画数据会一并删除，且不可恢复。";

        if (count === 0 || !window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      <input name="returnTo" type="hidden" value={returnTo} />
      <div className="table-bulk-actions">
        <span>已选择 {selectedCount} 个剧本</span>
        <BulkDeleteButton disabled={selectedCount === 0} />
      </div>
      {children}
    </form>
  );
}

export function AdminScriptSelectAllCheckbox() {
  return (
    <input
      aria-label="全选剧本"
      className="table-checkbox"
      onChange={(event) => {
        const form = event.currentTarget.form;
        if (!form) return;

        const checked = event.currentTarget.checked;
        form.querySelectorAll<HTMLInputElement>('input[name="scriptIds"]').forEach((checkbox) => {
          checkbox.checked = checked;
        });
        form.dispatchEvent(new Event("change", { bubbles: true }));
      }}
      type="checkbox"
    />
  );
}

export function AdminScriptDeleteButton({ scriptId }: { scriptId: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="link-btn danger"
      disabled={pending}
      name="deleteMode"
      type="submit"
      value={`single:${scriptId}`}
    >
      {pending ? "删除中" : "删除"}
    </button>
  );
}

function BulkDeleteButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="admin-btn danger"
      disabled={disabled || pending}
      name="deleteMode"
      type="submit"
      value="bulk"
    >
      <Trash2 size={14} />
      {pending ? "删除中" : "批量删除"}
    </button>
  );
}

function countSelectedScripts(form: HTMLFormElement) {
  return form.querySelectorAll<HTMLInputElement>('input[name="scriptIds"]:checked').length;
}
