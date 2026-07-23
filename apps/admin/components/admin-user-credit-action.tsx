"use client";

import { useFormStatus } from "react-dom";
import { adjustUserCredits } from "@/app/(admin)/users/actions";

export function AdminUserCreditAction({
  currentBalance,
  returnTo,
  userId,
}: {
  currentBalance: number | null;
  returnTo: string;
  userId: string;
}) {
  return (
    <form
      action={adjustUserCredits}
      className="user-credit-form"
      onSubmit={(event) => {
        const formData = new FormData(event.currentTarget);
        const mode = String(formData.get("mode"));
        const amount = String(formData.get("amount"));
        if (!window.confirm(`确认${modeLabel(mode)} ${amount} 点创作点？`)) {
          event.preventDefault();
        }
      }}
    >
      <input name="userId" type="hidden" value={userId} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <div className="user-credit-current">
        当前：{currentBalance === null ? "未初始化" : `${currentBalance} 点`}
      </div>
      <div className="user-credit-grid">
        <select className="select" name="mode" defaultValue="grant">
          <option value="grant">增加</option>
          <option value="deduct">扣减</option>
          <option value="set">设为</option>
        </select>
        <input className="input" min="0" name="amount" placeholder="点数" required type="number" />
      </div>
      <input className="input" maxLength={80} name="reason" placeholder="调整原因，例如：测试生成" required />
      <SubmitButton />
    </form>
  );
}

function modeLabel(mode: string) {
  if (mode === "deduct") return "扣减";
  if (mode === "set") return "设为";
  return "增加";
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="admin-btn primary user-credit-submit" disabled={pending} type="submit">
      {pending ? "保存中..." : "保存创作点"}
    </button>
  );
}
