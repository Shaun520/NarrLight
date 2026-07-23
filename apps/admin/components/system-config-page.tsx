"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MoreHorizontal, Save, TriangleAlert, X } from "lucide-react";
import { PageHeader } from "@/components/admin-static";
import { saveSystemConfig, type SaveSystemConfigResult } from "@/app/(admin)/system/actions";
import type {
  ContentSafetyConfig,
  GenerationSpecConfig,
  ImageProviderConfig,
  ImageProviderName,
  ProviderRuntimeConfig,
  QuotaDefaultsConfig,
  TextProviderConfig,
  TextProviderName,
} from "@narrlight/shared";
import {
  findSpecError,
  validateGenerationSpecConfig,
  type GenerationSpecValidationError,
} from "@narrlight/shared";
import type { SystemConfigSnapshot } from "@/lib/services/system-config";

type TextProviderMeta = {
  id: TextProviderName;
  logo: string;
  logoStyle?: { background: string };
  name: string;
  models: string[];
};

const TEXT_PROVIDERS: TextProviderMeta[] = [
  {
    id: "deepseek",
    logo: "DS",
    name: "DeepSeek",
    models: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-reasoner"],
  },
  {
    id: "glm",
    logo: "GLM",
    logoStyle: { background: "#1677ff" },
    name: "智谱 GLM",
    models: ["glm-5.2", "glm-5.1", "glm-4-plus"],
  },
];

type ImageProviderMeta = {
  id: ImageProviderName;
  logo: string;
  logoStyle?: { background: string };
  name: string;
  models: string[];
};

const IMAGE_PROVIDERS: ImageProviderMeta[] = [
  {
    id: "openai-image",
    logo: "OA",
    logoStyle: { background: "#10a37f" },
    name: "OpenAI",
    models: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"],
  },
  {
    id: "seedream",
    logo: "SD",
    logoStyle: { background: "#e35b32" },
    name: "Seedream",
    models: ["seedream-4.0", "seedream-3.0", "seedream-3.0-turbo"],
  },
  {
    id: "glm",
    logo: "GLM",
    logoStyle: { background: "#1677ff" },
    name: "智谱 GLM",
    models: ["cogview-4", "cogview-3-plus", "cogview-3"],
  },
];

const QUOTA_ROWS: Array<{
  key: keyof QuotaDefaultsConfig;
  label: string;
  desc: string;
  width: string;
}> = [
  { key: "free_quota_limit", label: "免费用户默认配额", desc: "新注册用户的生成次数上限", width: "120" },
  { key: "pro_monthly_quota", label: "Pro 用户月度配额", desc: "订阅 Pro 套餐后的月度重置值", width: "120" },
  { key: "max_script_words", label: "单剧本最大字数", desc: "超出后前端提示拆分", width: "140" },
];

type ConfigTab = "model" | "generation" | "policy";

const SPEC_BASE_ROWS: Array<{
  key: keyof Pick<
    GenerationSpecConfig,
    | "baseWordsPerHour"
    | "characterScriptShare"
    | "minScenesPerAct"
    | "minCluesPerRoundBase"
    | "playerClueRatio"
  >;
  label: string;
  desc: string;
  step: string;
}> = [
  { key: "baseWordsPerHour", label: "每小时目标字数", desc: "用于推导总字数目标", step: "100" },
  { key: "characterScriptShare", label: "角色剧本占比", desc: "总字数中分配给角色剧本的比例", step: "0.01" },
  { key: "minScenesPerAct", label: "每幕最低场景数", desc: "幕数乘以该值生成最低场景数", step: "1" },
  { key: "minCluesPerRoundBase", label: "每轮最低线索基数", desc: "和人数比例计算后取较大值", step: "1" },
  { key: "playerClueRatio", label: "人数线索比例", desc: "ceil(玩家人数 × 该比例)", step: "0.1" },
];

const DIFFICULTY_SPEC_ROWS: Array<{
  key: keyof GenerationSpecConfig["difficultyMultipliers"];
  label: string;
}> = [
  { key: "beginner", label: "新手" },
  { key: "intermediate", label: "进阶" },
  { key: "advanced", label: "烧脑" },
  { key: "expert", label: "专家" },
];

const GENRE_SPEC_ROWS: Array<{
  key: keyof GenerationSpecConfig["genreMultipliers"];
  label: string;
}> = [
  { key: "hardcore", label: "硬核" },
  { key: "emotion", label: "情感" },
  { key: "horror", label: "恐怖" },
  { key: "funny", label: "欢乐" },
  { key: "mechanism", label: "机制" },
];

export function SystemConfigPage({
  initialConfig,
  saved,
}: {
  initialConfig: SystemConfigSnapshot;
  saved?: boolean;
}) {
  const router = useRouter();
  const [textConfig, setTextConfig] = useState<TextProviderConfig>(initialConfig.textProvider);
  const [imageConfig, setImageConfig] = useState<ImageProviderConfig>(initialConfig.imageProvider);
  const [contentSafety, setContentSafety] = useState<ContentSafetyConfig>(initialConfig.contentSafety);
  const [quotaDefaults, setQuotaDefaults] = useState<QuotaDefaultsConfig>(initialConfig.quotaDefaults);
  const [generationSpec, setGenerationSpec] = useState<GenerationSpecConfig>(initialConfig.generationSpec);
  const [activeTab, setActiveTab] = useState<ConfigTab>("model");
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [state, formAction, pending] = useActionState<SaveSystemConfigResult | undefined, FormData>(
    saveSystemConfig,
    undefined,
  );

  // 监听 server action 返回状态，显示 toast 并刷新页面数据
  useEffect(() => {
    if (!state) return;

    if (state.success) {
      setToast({ type: "success", message: state.message ?? "配置已保存" });
      setReason("");
      setModalOpen(false);
      // 刷新 Server Component 数据，让 initialConfig 反映最新配置
      router.refresh();
      // 5 秒后自动消失
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }

    if (state.error) {
      console.error("[SystemConfigPage] 保存失败:", state.error);
      setToast({ type: "error", message: state.error });
      const timer = setTimeout(() => setToast(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [state, router]);

  const payload = useMemo(
    () =>
      JSON.stringify({
        textProvider: textConfig,
        imageProvider: imageConfig,
        contentSafety,
        quotaDefaults,
        generationSpec,
      }),
    [textConfig, imageConfig, contentSafety, quotaDefaults, generationSpec],
  );

  // 实时校验生成规格配置，错误以 field 路径索引，便于在对应输入框下方显示提示
  const specErrors: GenerationSpecValidationError[] = useMemo(
    () => validateGenerationSpecConfig(generationSpec),
    [generationSpec],
  );
  const hasSpecErrors = specErrors.length > 0;

  // 确认保存时只校验 reason 非空，实际提交交给 form action；
  // 关闭 modal 放在 useEffect 的 success 分支中，避免提前移除 submit 按钮导致表单未提交。

  const textPrimaryMeta = TEXT_PROVIDERS.find((p) => p.id === textConfig.primary)!;
  const textFallbackMeta = textConfig.fallback ? TEXT_PROVIDERS.find((p) => p.id === textConfig.fallback) : null;
  const imagePrimaryMeta = IMAGE_PROVIDERS.find((p) => p.id === imageConfig.primary)!;
  const imageFallbackMeta = imageConfig.fallback
    ? IMAGE_PROVIDERS.find((p) => p.id === imageConfig.fallback)
    : null;
  const updateDurationBand = (
    index: number,
    key: keyof GenerationSpecConfig["durationBands"][number],
    value: number,
  ) => {
    setGenerationSpec((current) => ({
      ...current,
      durationBands: current.durationBands.map((band, bandIndex) =>
        bandIndex === index ? { ...band, [key]: value } : band,
      ),
    }));
  };

  return (
    <form action={formAction} className="page-stack" id="systemConfigForm">
      <PageHeader
        title="系统配置"
        description="管理 AI 提供商、默认配额及内容安全策略。API Key 由环境变量管理，此处仅配置运行时路由。保存时必须填写变更原因。"
        actions={
          <button
            className="admin-btn primary"
            disabled={pending || hasSpecErrors}
            type="button"
            onClick={() => setModalOpen(true)}
            title={hasSpecErrors ? "生成规格配置存在错误，请先修复" : undefined}
          >
            {pending ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {pending ? "保存中..." : "保存变更"}
          </button>
        }
      />

      {saved && !toast && (
        <div className="admin-inline-alert" role="status">
          配置已保存，变更原因已写入审计日志。
        </div>
      )}

      {hasSpecErrors && (
        <div className="admin-inline-alert admin-inline-alert-error" role="alert">
          <div className="admin-inline-alert-title">
            <TriangleAlert size={14} />
            <span>生成规格配置存在 {specErrors.length} 个问题，保存已禁用</span>
          </div>
          <ul className="admin-inline-alert-list">
            {specErrors.map((err, index) => (
              <li key={`${err.field}-${index}`}>{err.message}</li>
            ))}
          </ul>
        </div>
      )}

      <input name="payload" type="hidden" value={payload} />
      <input name="reason" type="hidden" value={reason} />

      <div className="admin-tabs" role="tablist" aria-label="系统配置分类">
        <TabButton active={activeTab === "model"} label="模型配置" onClick={() => setActiveTab("model")} />
        <TabButton active={activeTab === "generation"} label="生成规格" onClick={() => setActiveTab("generation")} />
        <TabButton active={activeTab === "policy"} label="配额与安全" onClick={() => setActiveTab("policy")} />
      </div>

      {activeTab === "generation" && (
        <section className="admin-card">
          <div className="admin-card-head">
            <div className="admin-card-title">生成规格</div>
            <div className="admin-card-sub">控制时长、人数、题材和难度如何换算为最低结构与字数。</div>
          </div>
          <div className="admin-card-body">
            {SPEC_BASE_ROWS.map((row) => {
              const error = findSpecError(specErrors, row.key);
              return (
                <div className="config-row" key={row.key}>
                  <div className="config-info">
                    <div className="config-label">{row.label}</div>
                    <div className="config-desc">{row.desc}</div>
                  </div>
                  <div className="config-input-group">
                    <input
                      className={`input config-number-input${error ? " input-error" : ""}`}
                      min="0"
                      step={row.step}
                      type="number"
                      value={generationSpec[row.key]}
                      onChange={(event) =>
                        setGenerationSpec((current) => ({
                          ...current,
                          [row.key]: Number(event.target.value) || 0,
                        }))
                      }
                    />
                    {error && <div className="config-input-error">{error}</div>}
                  </div>
                </div>
              );
            })}

            <div className="config-subtitle">玩家剧本配置</div>
            <div className="config-row">
              <div className="config-info">
                <div className="config-label">每名玩家剧本生成方式</div>
                <div className="config-desc">控制每名玩家拿到一本、按幕拿本，还是按自定义数量生成</div>
              </div>
              <select
                className="select"
                value={generationSpec.characterScriptMode}
                onChange={(event) =>
                  setGenerationSpec((current) => ({
                    ...current,
                    characterScriptMode: event.target.value as GenerationSpecConfig["characterScriptMode"],
                  }))
                }
              >
                <option value="single">每名玩家一本</option>
                <option value="per_act">每幕发一本</option>
                <option value="custom">自定义每人本数</option>
              </select>
            </div>
            <div className="config-row">
              <div className="config-info">
                <div className="config-label">每名玩家剧本数</div>
                <div className="config-desc">仅在“自定义每人本数”模式下使用</div>
              </div>
              <div className="config-input-group">
                <input
                  className={`input config-number-input${
                    findSpecError(specErrors, "customScriptsPerPlayer") ? " input-error" : ""
                  }`}
                  disabled={generationSpec.characterScriptMode !== "custom"}
                  min="1"
                  type="number"
                  value={generationSpec.customScriptsPerPlayer}
                  onChange={(event) =>
                    setGenerationSpec((current) => ({
                      ...current,
                      customScriptsPerPlayer: Number(event.target.value) || 1,
                    }))
                  }
                />
                {findSpecError(specErrors, "customScriptsPerPlayer") && (
                  <div className="config-input-error">
                    {findSpecError(specErrors, "customScriptsPerPlayer")}
                  </div>
                )}
              </div>
            </div>

            <div className="config-subtitle">时长档位</div>
            <div className="spec-band-header" aria-hidden="true">
              <span>适用时长</span>
              <span>最小时长</span>
              <span>最大时长</span>
              <span>生成幕数</span>
              <span>搜证轮次</span>
            </div>
            {generationSpec.durationBands.map((band, index) => {
              const bandField = `durationBands[${index}]`;
              const minErr = findSpecError(specErrors, `${bandField}.minDuration`);
              const maxErr = findSpecError(specErrors, `${bandField}.maxDuration`);
              const actErr = findSpecError(specErrors, `${bandField}.actCount`);
              const roundErr = findSpecError(specErrors, `${bandField}.searchRoundCount`);
              const bandErr = findSpecError(specErrors, bandField);
              const hasBandError = Boolean(minErr || maxErr || actErr || roundErr || bandErr);
              return (
                <div
                  className={`spec-band-row${hasBandError ? " spec-band-row-error" : ""}`}
                  key={`${band.minDuration}-${band.maxDuration}`}
                >
                  <div className="config-info">
                    <div className="config-label">
                      {band.minDuration}-{band.maxDuration} 小时
                    </div>
                    <div className="config-desc">该范围触发对应规格</div>
                    {bandErr && <div className="config-input-error">{bandErr}</div>}
                  </div>
                  <div className="config-input-group">
                    <input
                      aria-label="最小时长"
                      className={`input spec-number-input${minErr ? " input-error" : ""}`}
                      min="1"
                      type="number"
                      value={band.minDuration}
                      onChange={(event) => updateDurationBand(index, "minDuration", Number(event.target.value) || 0)}
                    />
                    {minErr && <div className="config-input-error">{minErr}</div>}
                  </div>
                  <div className="config-input-group">
                    <input
                      aria-label="最大时长"
                      className={`input spec-number-input${maxErr ? " input-error" : ""}`}
                      min="1"
                      type="number"
                      value={band.maxDuration}
                      onChange={(event) => updateDurationBand(index, "maxDuration", Number(event.target.value) || 0)}
                    />
                    {maxErr && <div className="config-input-error">{maxErr}</div>}
                  </div>
                  <div className="config-input-group">
                    <input
                      aria-label="幕数"
                      className={`input spec-number-input${actErr ? " input-error" : ""}`}
                      min="1"
                      type="number"
                      value={band.actCount}
                      onChange={(event) => updateDurationBand(index, "actCount", Number(event.target.value) || 0)}
                    />
                    {actErr && <div className="config-input-error">{actErr}</div>}
                  </div>
                  <div className="config-input-group">
                    <input
                      aria-label="搜证轮次"
                      className={`input spec-number-input${roundErr ? " input-error" : ""}`}
                      min="1"
                      type="number"
                      value={band.searchRoundCount}
                      onChange={(event) =>
                        updateDurationBand(index, "searchRoundCount", Number(event.target.value) || 0)
                      }
                    />
                    {roundErr && <div className="config-input-error">{roundErr}</div>}
                  </div>
                </div>
              );
            })}
            {/*
              durationBands 整体区间覆盖/空档错误统一在顶部 admin-inline-alert-error 中展示，
              此处不再重复显示，避免档位行下方重复信息干扰。
            */}

            <div className="config-subtitle">难度系数</div>
            <div className="spec-factor-grid">
              {DIFFICULTY_SPEC_ROWS.map((row) => {
                const error = findSpecError(specErrors, `difficultyMultipliers.${row.key}`);
                return (
                  <label className="config-field" key={row.key}>
                    <span>{row.label}</span>
                    <input
                      className={`input${error ? " input-error" : ""}`}
                      min="0"
                      step="0.01"
                      type="number"
                      value={generationSpec.difficultyMultipliers[row.key]}
                      onChange={(event) =>
                        setGenerationSpec((current) => ({
                          ...current,
                          difficultyMultipliers: {
                            ...current.difficultyMultipliers,
                            [row.key]: Number(event.target.value) || 0,
                          },
                        }))
                      }
                    />
                    {error && <div className="config-input-error">{error}</div>}
                  </label>
                );
              })}
            </div>

            <div className="config-subtitle">题材系数</div>
            <div className="spec-factor-grid">
              {GENRE_SPEC_ROWS.map((row) => {
                const error = findSpecError(specErrors, `genreMultipliers.${row.key}`);
                return (
                  <label className="config-field" key={row.key}>
                    <span>{row.label}</span>
                    <input
                      className={`input${error ? " input-error" : ""}`}
                      min="0"
                      step="0.01"
                      type="number"
                      value={generationSpec.genreMultipliers[row.key]}
                      onChange={(event) =>
                        setGenerationSpec((current) => ({
                          ...current,
                          genreMultipliers: {
                            ...current.genreMultipliers,
                            [row.key]: Number(event.target.value) || 0,
                          },
                        }))
                      }
                    />
                    {error && <div className="config-input-error">{error}</div>}
                  </label>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {activeTab === "model" && (
        <>
      <section className="admin-card">
        <div className="admin-card-head">
          <div className="admin-card-title">模型配置</div>
          <div className="admin-card-sub">选择剧本生成与插画生成的主/备 provider</div>
        </div>
        <div className="admin-card-body">
          <div className="model-route-grid">
            <label className="model-route-item">
              <span className="model-route-label">剧本生成 - 主模型</span>
              <select
                className="select model-route-select"
                value={textConfig.primary}
                onChange={(event) =>
                  setTextConfig((current) => ({
                    ...current,
                    primary: event.target.value as TextProviderName,
                  }))
                }
              >
                {TEXT_PROVIDERS.map((provider) => (
                  <option
                    disabled={provider.id === textConfig.fallback}
                    key={provider.id}
                    value={provider.id}
                  >
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="model-route-item">
              <span className="model-route-label">剧本生成 - 备用模型</span>
              <select
                className="select model-route-select"
                value={textConfig.fallback ?? ""}
                onChange={(event) =>
                  setTextConfig((current) => ({
                    ...current,
                    fallback: (event.target.value || null) as TextProviderName | null,
                  }))
                }
              >
                <option value="">不启用备用</option>
                {TEXT_PROVIDERS.map((provider) => (
                  <option
                    disabled={provider.id === textConfig.primary}
                    key={provider.id}
                    value={provider.id}
                  >
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="model-route-item">
              <span className="model-route-label">插画生成 - 主模型</span>
              <select
                className="select model-route-select"
                value={imageConfig.primary}
                onChange={(event) =>
                  setImageConfig((current) => ({
                    ...current,
                    primary: event.target.value as ImageProviderName,
                  }))
                }
              >
                {IMAGE_PROVIDERS.map((provider) => (
                  <option
                    disabled={provider.id === imageConfig.fallback}
                    key={provider.id}
                    value={provider.id}
                  >
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="model-route-item">
              <span className="model-route-label">插画生成 - 备用模型</span>
              <select
                className="select model-route-select"
                value={imageConfig.fallback ?? ""}
                onChange={(event) =>
                  setImageConfig((current) => ({
                    ...current,
                    fallback: (event.target.value || null) as ImageProviderName | null,
                  }))
                }
              >
                <option value="">不启用备用</option>
                {IMAGE_PROVIDERS.map((provider) => (
                  <option
                    disabled={provider.id === imageConfig.primary}
                    key={provider.id}
                    value={provider.id}
                  >
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div className="admin-card-title">供应商配置</div>
        </div>
        <div className="admin-card-body provider-config-grid">
          {textPrimaryMeta && (
            <ProviderCard
              badge="剧本生成 - 主模型"
              kind="文本模型"
              logo={textPrimaryMeta.logo}
              logoStyle={textPrimaryMeta.logoStyle}
              models={textPrimaryMeta.models}
              name={textPrimaryMeta.name}
              runtime={textConfig.providers[textPrimaryMeta.id]}
              onChange={(runtime) =>
                setTextConfig((current) => ({
                  ...current,
                  providers: { ...current.providers, [textPrimaryMeta.id]: runtime },
                }))
              }
            />
          )}
          {textFallbackMeta && (
            <ProviderCard
              badge="剧本生成 - 备用模型"
              kind="文本模型"
              logo={textFallbackMeta.logo}
              logoStyle={textFallbackMeta.logoStyle}
              models={textFallbackMeta.models}
              name={textFallbackMeta.name}
              runtime={textConfig.providers[textFallbackMeta.id]}
              onChange={(runtime) =>
                setTextConfig((current) => ({
                  ...current,
                  providers: { ...current.providers, [textFallbackMeta.id]: runtime },
                }))
              }
            />
          )}
          {imagePrimaryMeta && (
            <ProviderCard
              badge="插画生成 - 主模型"
              kind="图像模型"
              logo={imagePrimaryMeta.logo}
              logoStyle={imagePrimaryMeta.logoStyle}
              models={imagePrimaryMeta.models}
              name={imagePrimaryMeta.name}
              runtime={imageConfig.providers[imagePrimaryMeta.id]}
              onChange={(runtime) =>
                setImageConfig((current) => ({
                  ...current,
                  providers: { ...current.providers, [imagePrimaryMeta.id]: runtime },
                }))
              }
            />
          )}
          {imageFallbackMeta && (
            <ProviderCard
              badge="插画生成 - 备用模型"
              kind="图像模型"
              logo={imageFallbackMeta.logo}
              logoStyle={imageFallbackMeta.logoStyle}
              models={imageFallbackMeta.models}
              name={imageFallbackMeta.name}
              runtime={imageConfig.providers[imageFallbackMeta.id]}
              onChange={(runtime) =>
                setImageConfig((current) => ({
                  ...current,
                  providers: { ...current.providers, [imageFallbackMeta.id]: runtime },
                }))
              }
            />
          )}
        </div>
      </section>

        </>
      )}

      {activeTab === "policy" && (
        <>
      <section className="admin-card">
        <div className="admin-card-head">
          <div className="admin-card-title">配额默认值</div>
          <div className="admin-card-sub">控制新用户默认配额与各套餐限制</div>
        </div>
        <div className="admin-card-body">
          {QUOTA_ROWS.map((row) => (
            <div className="config-row" key={row.key}>
              <div className="config-info">
                <div className="config-label">{row.label}</div>
                <div className="config-desc">{row.desc}</div>
              </div>
              <input
                className="input config-number-input"
                min="0"
                style={{ width: `${row.width}px` }}
                type="number"
                value={quotaDefaults[row.key]}
                onChange={(event) =>
                  setQuotaDefaults((current) => ({
                    ...current,
                    [row.key]: Number(event.target.value) || 0,
                  }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div className="admin-card-title">内容安全</div>
          <div className="admin-card-sub">敏感词与生成内容过滤规则</div>
        </div>
        <div className="admin-card-body">
          <div className="config-row">
            <div className="config-info">
              <div className="config-label">启用敏感词过滤</div>
              <div className="config-desc">对生成结果与社区内容进行实时检测</div>
            </div>
            <ToggleSwitch
              enabled={contentSafety.enabled}
              label="启用敏感词过滤"
              onToggle={(enabled) => setContentSafety((current) => ({ ...current, enabled }))}
            />
          </div>
          <div className="config-row config-review-row">
            <div className="config-info">
              <div className="config-label">生成内容人工复核</div>
              <div className="config-desc">所有生成剧本默认进入 reviewing 状态</div>
            </div>
            <ToggleSwitch
              enabled={contentSafety.manual_review}
              label="生成内容人工复核"
              onToggle={(manual_review) =>
                setContentSafety((current) => ({ ...current, manual_review }))
              }
            />
          </div>
        </div>
      </section>

        </>
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="save-config-title">
            <div className="modal-head">
              <div className="modal-title" id="save-config-title">
                保存系统配置
              </div>
              <button className="drawer-close" type="button" onClick={() => setModalOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="alert alert-warning">
                <TriangleAlert size={14} />
                <span>配置变更将影响所有用户的生成与插画任务，请谨慎操作。</span>
              </div>
              <label className="form-item">
                <span className="form-label required">变更原因</span>
                <textarea
                  className="textarea form-control"
                  placeholder="请填写变更原因，将写入审计日志"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            </div>
            <div className="modal-foot">
              <button
                className="admin-btn"
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={pending}
              >
                取消
              </button>
              <button
                className="admin-btn primary"
                disabled={!reason.trim() || pending}
                form="systemConfigForm"
                type="submit"
              >
                {pending ? <Loader2 size={14} className="spin" /> : null}
                {pending ? "保存中..." : "确认保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`} role="alert">
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
          <span>{toast.message}</span>
          <button
            className="toast-close"
            type="button"
            onClick={() => setToast(null)}
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </form>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={`admin-tab${active ? " active" : ""}`}
      role="tab"
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ProviderCard({
  badge,
  logo,
  logoStyle,
  name,
  kind,
  models,
  runtime,
  onChange,
}: {
  badge: string;
  logo: string;
  logoStyle?: { background: string };
  name: string;
  kind: string;
  models: string[];
  runtime: ProviderRuntimeConfig | undefined;
  onChange: (runtime: ProviderRuntimeConfig) => void;
}) {
  if (!runtime) {
    return (
      <section className="admin-card config-card">
        <div className="config-head">
          <div className="provider">
            <span className="provider-logo" style={logoStyle}>
              {logo}
            </span>
            <span>
              <b>{badge}</b>
              <small>
                {name} · {kind}供应商
              </small>
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-card config-card">
      <div className="config-head">
        <div className="provider">
          <span className="provider-logo" style={logoStyle}>
            {logo}
          </span>
          <span>
            <b>{badge}</b>
            <small>
              {name} · {kind}供应商
            </small>
          </span>
        </div>
        <div className="config-actions">
          <button className="config-more-btn" type="button" aria-label="更多操作">
            <MoreHorizontal size={14} />
          </button>
          <ToggleSwitch
            enabled={runtime.enabled}
            label={`${name} 启用或停用`}
            onToggle={(enabled) => onChange({ ...runtime, enabled })}
          />
        </div>
      </div>

      <label className="config-field">
        <span>{kind}</span>
        <select
          className="select config-select"
          value={runtime.model}
          onChange={(event) => onChange({ ...runtime, model: event.target.value })}
        >
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
          {runtime.model && !models.includes(runtime.model) && (
            <option value={runtime.model}>{runtime.model}（自定义）</option>
          )}
        </select>
      </label>

      <label className="config-field">
        <span>重试次数</span>
        <input
          className="input"
          max="10"
          min="0"
          type="number"
          value={runtime.retries}
          onChange={(event) => onChange({ ...runtime, retries: Number(event.target.value) || 0 })}
        />
      </label>
    </section>
  );
}

function ToggleSwitch({
  enabled = false,
  label,
  onToggle,
}: {
  enabled?: boolean;
  label: string;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <button
      className={`switch${enabled ? " on" : ""}`}
      type="button"
      aria-label={label}
      aria-pressed={enabled}
      onClick={() => onToggle(!enabled)}
    />
  );
}
