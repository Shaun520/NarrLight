"use client";

import { MoreHorizontal, Save, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/admin-static";

type ProviderId = "deepseek" | "seedream" | "glm" | "qwen" | "openai" | "gemini" | "claude";
type RouteKey = "scriptPrimary" | "scriptFallback" | "imagePrimary" | "imageFallback";
type ModelKind = "text" | "image";

type ProviderField =
  | { label: string; kind?: ModelKind; type: "select"; value: string; options: string[] }
  | { label: string; kind?: ModelKind; type: "password" | "text"; value: string };

const textProviders: ProviderId[] = ["deepseek", "glm", "qwen", "openai", "gemini", "claude"];
const imageProviders: ProviderId[] = ["seedream", "glm", "openai", "gemini"];

const providers: Array<{
  id: ProviderId;
  logo: string;
  logoStyle?: { background: string };
  name: string;
  enabled: boolean;
  retryCount: string;
  fields: ProviderField[];
}> = [
  {
    id: "deepseek",
    logo: "DS",
    name: "DeepSeek",
    enabled: true,
    retryCount: "3",
    fields: [
      { label: "文本模型", kind: "text", type: "select", value: "deepseek-v4-pro", options: ["deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"] },
      { label: "API Key", type: "password", value: "sk-••••••••••••d2a" },
    ],
  },
  {
    id: "seedream",
    logo: "SD",
    logoStyle: { background: "#e35b32" },
    name: "Seedream",
    enabled: true,
    retryCount: "2",
    fields: [
      { label: "图像模型", kind: "image", type: "select", value: "seedream-3.0", options: ["seedream-4.0", "seedream-3.0", "seedream-3.0-turbo"] },
      { label: "API Key", type: "password", value: "••••••••••••" },
    ],
  },
  {
    id: "glm",
    logo: "GLM",
    logoStyle: { background: "#1677ff" },
    name: "智谱 GLM",
    enabled: true,
    retryCount: "3",
    fields: [
      { label: "文本模型", kind: "text", type: "select", value: "glm-5.2", options: ["glm-5.2", "glm-5.1", "glm-4-plus"] },
      { label: "图像模型", kind: "image", type: "select", value: "cogview-3-plus", options: ["cogview-4", "cogview-3-plus", "cogview-3"] },
      { label: "API Key", type: "password", value: "••••••••••••f01" },
    ],
  },
  {
    id: "qwen",
    logo: "QW",
    logoStyle: { background: "#624aff" },
    name: "Qwen",
    enabled: true,
    retryCount: "3",
    fields: [
      { label: "文本模型", kind: "text", type: "select", value: "qwen-plus", options: ["qwen-max", "qwen-plus", "qwen-turbo"] },
      { label: "API Key", type: "password", value: "sk-••••••••••••2aa" },
    ],
  },
  {
    id: "openai",
    logo: "OA",
    logoStyle: { background: "#10a37f" },
    name: "OpenAI",
    enabled: true,
    retryCount: "3",
    fields: [
      { label: "文本模型", kind: "text", type: "select", value: "gpt-5.5", options: ["gpt-5.5", "gpt-5.1", "gpt-4.1"] },
      { label: "图像模型", kind: "image", type: "select", value: "gpt-image-2", options: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"] },
      { label: "API Key", type: "password", value: "sk-proj-••••••••••••" },
    ],
  },
  {
    id: "gemini",
    logo: "GM",
    logoStyle: { background: "#4285f4" },
    name: "Gemini",
    enabled: false,
    retryCount: "3",
    fields: [
      { label: "文本模型", kind: "text", type: "select", value: "gemini-2.5-pro", options: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro"] },
      { label: "图像模型", kind: "image", type: "select", value: "imagen-4", options: ["imagen-4", "imagen-3"] },
      { label: "API Key", type: "password", value: "••••••••••••" },
    ],
  },
  {
    id: "claude",
    logo: "CL",
    logoStyle: { background: "#d97757" },
    name: "Claude",
    enabled: false,
    retryCount: "3",
    fields: [
      { label: "文本模型", kind: "text", type: "select", value: "claude-3.5-sonnet", options: ["claude-4.5-sonnet", "claude-3.5-sonnet", "claude-3-opus"] },
      { label: "API Key", type: "password", value: "sk-ant-••••••••" },
    ],
  },
];

const providerById = Object.fromEntries(providers.map((provider) => [provider.id, provider])) as Record<ProviderId, (typeof providers)[number]>;

const modelRoutes: Array<{
  key: RouteKey;
  label: string;
  modelKind: ModelKind;
  pairedKey: RouteKey;
  options: ProviderId[];
}> = [
  { key: "scriptPrimary", label: "剧本生成 - 主模型", modelKind: "text", pairedKey: "scriptFallback", options: textProviders },
  { key: "scriptFallback", label: "剧本生成 - 备用模型", modelKind: "text", pairedKey: "scriptPrimary", options: textProviders },
  { key: "imagePrimary", label: "插画生成 - 主模型", modelKind: "image", pairedKey: "imageFallback", options: imageProviders },
  { key: "imageFallback", label: "插画生成 - 备用模型", modelKind: "image", pairedKey: "imagePrimary", options: imageProviders },
];

const quotaRows = [
  ["免费用户默认配额", "新注册用户的生成次数上限", "10", "120"],
  ["Pro 用户月度配额", "订阅 Pro 套餐后的月度重置值", "500", "120"],
  ["单剧本最大字数", "超出后前端提示拆分", "150000", "140"],
] as const;

const moreConfigFields: Record<ModelKind, ProviderField[]> = {
  text: [
    { label: "温度", type: "text", value: "0.7" },
    { label: "Top P", type: "text", value: "0.9" },
    { label: "并发上限", type: "text", value: "5" },
    { label: "返回格式", type: "select", value: "JSON", options: ["JSON", "Text"] },
  ],
  image: [
    { label: "质量", type: "select", value: "标准", options: ["标准", "高清", "极速"] },
    { label: "尺寸", type: "select", value: "1024 x 1024", options: ["1024 x 1024", "1024 x 1536", "1536 x 1024"] },
    { label: "种子", type: "text", value: "自动" },
    { label: "提示词增强", type: "select", value: "启用", options: ["启用", "关闭"] },
  ],
};

function modelKindText(kind: ModelKind) {
  return kind === "text" ? "文本模型" : "图像模型";
}

function fieldsForRoute(fields: ProviderField[], modelKind: ModelKind) {
  return fields.filter((field) => !field.kind || field.kind === modelKind);
}

export function SystemConfigPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedConfig, setExpandedConfig] = useState<Partial<Record<RouteKey, boolean>>>({});
  const [routeProviders, setRouteProviders] = useState<Record<RouteKey, ProviderId>>({
    scriptPrimary: "deepseek",
    scriptFallback: "qwen",
    imagePrimary: "openai",
    imageFallback: "glm",
  });

  const routeProviderCards = useMemo(() => {
    return modelRoutes.map((route) => ({
      route,
      provider: providerById[routeProviders[route.key]],
    }));
  }, [routeProviders]);

  return (
    <div className="page-stack">
      <PageHeader
        title="系统配置"
        description="管理 AI 提供商、默认配额及内容安全策略。保存时必须填写变更原因。"
        actions={
          <button className="admin-btn primary" type="button" onClick={() => setModalOpen(true)}>
            <Save size={14} />
            保存变更
          </button>
        }
      />

      <section className="admin-card">
        <div className="admin-card-head">
          <div className="admin-card-title">模型配置</div>
        </div>
        <div className="admin-card-body">
          <div className="model-route-grid">
            {modelRoutes.map((route) => (
              <label className="model-route-item" key={route.key}>
                <span className="model-route-label">{route.label}</span>
                <select
                  className="select model-route-select"
                  value={routeProviders[route.key]}
                  onChange={(event) =>
                    setRouteProviders((current) => ({
                      ...current,
                      [route.key]: event.target.value as ProviderId,
                    }))
                  }
                >
                  {route.options.map((providerId) => (
                    <option disabled={providerId === routeProviders[route.pairedKey]} key={providerId} value={providerId}>
                      {providerById[providerId].name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="model-config-divider">
            <span>供应商配置</span>
          </div>

          <div className="provider-config-grid">
            {routeProviderCards.map(({ route, provider }) => {
              const isExpanded = Boolean(expandedConfig[route.key]);

              return (
                <section className="admin-card config-card" key={route.key}>
                  <div className="config-head">
                    <div className="provider">
                      <span className="provider-logo" style={provider.logoStyle}>
                        {provider.logo}
                      </span>
                      <span>
                        <b>{route.label}</b>
                        <small>
                          {provider.name} · {modelKindText(route.modelKind)}供应商
                        </small>
                      </span>
                    </div>
                    <div className="config-actions">
                      <button
                        className={`config-more-btn${isExpanded ? " active" : ""}`}
                        type="button"
                        aria-label={`${route.label} 更多配置`}
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedConfig((current) => ({
                            ...current,
                            [route.key]: !current[route.key],
                          }))
                        }
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      <ToggleSwitch enabled={provider.enabled} label={`${route.label} 启用或停用`} />
                    </div>
                  </div>

                  {fieldsForRoute(provider.fields, route.modelKind).map((field) => (
                    <ConfigField field={field} key={field.label} />
                  ))}
                  <ConfigField field={{ label: "重试次数", type: "text", value: provider.retryCount }} />

                  {isExpanded && (
                    <div className="advanced-config">
                      {moreConfigFields[route.modelKind].map((field) => (
                        <ConfigField field={field} key={field.label} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div className="admin-card-title">配额默认值</div>
          <div className="admin-card-sub">控制新用户默认配额与各套餐限制</div>
        </div>
        <div className="admin-card-body">
          {quotaRows.map(([label, desc, value, width]) => (
            <div className="config-row" key={label}>
              <div className="config-info">
                <div className="config-label">{label}</div>
                <div className="config-desc">{desc}</div>
              </div>
              <input className="input config-number-input" type="number" defaultValue={value} style={{ width: `${width}px` }} />
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
            <ToggleSwitch enabled label="启用敏感词过滤" />
          </div>
          <div className="config-row">
            <div className="config-info">
              <div className="config-label">敏感词词库</div>
              <div className="config-desc">每行一个词，保存后立即生效</div>
            </div>
          </div>
          <textarea className="textarea config-words-input" defaultValue={"血腥\n暴力\n色情\n政治敏感\n..."} />
          <div className="config-row config-review-row">
            <div className="config-info">
              <div className="config-label">生成内容人工复核</div>
              <div className="config-desc">所有生成剧本默认进入 reviewing 状态</div>
            </div>
            <ToggleSwitch label="生成内容人工复核" />
          </div>
        </div>
      </section>

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
                <textarea className="textarea form-control" placeholder="请填写变更原因，将写入审计日志" />
              </label>
            </div>
            <div className="modal-foot">
              <button className="admin-btn" type="button" onClick={() => setModalOpen(false)}>
                取消
              </button>
              <button className="admin-btn primary" type="button" onClick={() => setModalOpen(false)}>
                确认保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigField({ field }: { field: ProviderField }) {
  return (
    <label className="config-field">
      <span>{field.label}</span>
      {field.type === "select" ? (
        <select className="select config-select" defaultValue={field.value}>
          {field.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input className="input" type={field.type} defaultValue={field.value} />
      )}
    </label>
  );
}

function ToggleSwitch({ enabled = false, label }: { enabled?: boolean; label: string }) {
  const [checked, setChecked] = useState(enabled);

  return (
    <button
      className={`switch${checked ? " on" : ""}`}
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={() => setChecked((current) => !current)}
    />
  );
}
