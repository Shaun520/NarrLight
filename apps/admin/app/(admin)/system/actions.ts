"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { updateSystemConfig } from "@/lib/services/system-config";
import type {
  ContentSafetyConfig,
  ImageProviderConfig,
  QuotaDefaultsConfig,
  TextProviderConfig,
} from "@narrlight/shared";

export type SaveSystemConfigResult = {
  error?: string;
  success?: boolean;
  message?: string;
};

type SavePayload = {
  textProvider: TextProviderConfig;
  imageProvider: ImageProviderConfig;
  contentSafety: ContentSafetyConfig;
  quotaDefaults: QuotaDefaultsConfig;
};

export async function saveSystemConfig(
  _prev: SaveSystemConfigResult | undefined,
  formData: FormData,
): Promise<SaveSystemConfigResult> {
  try {
    const admin = await requireAdmin();

    const payloadRaw = String(formData.get("payload") ?? "");
    const reason = String(formData.get("reason") ?? "");

    if (!reason.trim()) {
      return { error: "变更原因不能为空" };
    }

    let payload: SavePayload;
    try {
      payload = JSON.parse(payloadRaw) as SavePayload;
    } catch {
      return { error: "配置数据格式异常，无法解析 JSON" };
    }

    const entries = [
      { key: "text_provider", value: payload.textProvider },
      { key: "image_provider", value: payload.imageProvider },
      { key: "content_safety", value: payload.contentSafety },
      { key: "quota_defaults", value: payload.quotaDefaults },
    ] as const;

    for (const entry of entries) {
      const result = await updateSystemConfig(entry.key, entry.value, admin, reason);
      if (!result.ok) {
        return { error: result.error };
      }
    }

    // 刷新 /system 路径缓存，下次请求会读到新配置
    revalidatePath("/system");

    return {
      success: true,
      message: "配置已保存，web 端下次请求将自动读取新配置。变更原因已写入审计日志。",
    };
  } catch (error) {
    console.error("[saveSystemConfig] 保存系统配置失败:", error);
    return {
      error:
        error instanceof Error
          ? `保存失败：${error.message}`
          : "保存失败，请检查网络连接或联系管理员",
    };
  }
}
