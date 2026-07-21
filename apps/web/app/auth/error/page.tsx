import { Card } from "@/components/common";
import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;
  const message =
    params?.error === "account_banned"
      ? "账号已被封禁，请联系管理员。"
      : params?.error
        ? `错误代码：${params.error}`
        : "发生未知错误。";

  return (
    <p className="text-sm text-muted-foreground">{message}</p>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card title="账号状态异常">
            <Suspense>
              <ErrorContent searchParams={searchParams} />
            </Suspense>
          </Card>
        </div>
      </div>
    </div>
  );
}
