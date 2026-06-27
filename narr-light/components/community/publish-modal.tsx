"use client";

/**
 * 社区发布通用弹窗，支持 4 种发布类型
 *
 * 类型与表单字段：
 * 1. 投稿作品(submit)   —— 标题、正文、附件（开发期仅显示）
 * 2. 发布剧本(publish)  —— 剧本名、题材、人数、时长、简介
 * 3. 发起拼车(carpool)  —— 剧本名、时间、地点、人数、备注
 * 4. 求本组局(request)  —— 剧本名、需求描述、期望人数
 *
 * 基于 antd Modal + Form 实现；z-index 设为 1001，高于社区页 FAB(60)。
 */
import React, { useEffect, useMemo } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Upload,
  type UploadProps,
} from "antd";
import { InboxOutlined } from "@ant-design/icons";

/** 发布类型 */
export type PublishType = "submit" | "publish" | "carpool" | "request";

export interface PublishModalProps {
  open: boolean;
  type: PublishType;
  onClose: () => void;
  onSubmit: (data: Record<string, string>) => void;
}

/** 字段控件类型 */
type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "datetime"
  | "file";

/** 字段配置 */
interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { label: string; value: string }[];
  required?: boolean;
  rows?: number;
  /** 开发期仅显示，不参与提交校验 */
  displayOnly?: boolean;
}

/** 题材选项 */
const GENRE_OPTIONS: { label: string; value: string }[] = [
  { label: "悬疑", value: "suspense" },
  { label: "情感", value: "emotion" },
  { label: "恐怖", value: "horror" },
  { label: "欢乐", value: "happy" },
  { label: "机制", value: "mechanism" },
  { label: "阵营", value: "camp" },
  { label: "古风", value: "ancient" },
  { label: "现代", value: "modern" },
  { label: "科幻", value: "scifi" },
];

/** 人数选项（4-12 人） */
const PLAYER_COUNT_OPTIONS: { label: string; value: string }[] = Array.from(
  { length: 9 },
  (_, i) => {
    const n = String(i + 4);
    return { label: `${n} 人`, value: n };
  }
);

/** 时长选项 */
const DURATION_OPTIONS: { label: string; value: string }[] = [
  { label: "2-3 小时", value: "2-3" },
  { label: "3-4 小时", value: "3-4" },
  { label: "4-5 小时", value: "4-5" },
  { label: "5-6 小时", value: "5-6" },
  { label: "6 小时以上", value: "6+" },
];

/** 4 种类型 → 字段配置 */
const FIELD_CONFIGS: Record<PublishType, FieldConfig[]> = {
  submit: [
    {
      name: "title",
      label: "标题",
      type: "text",
      placeholder: "请输入作品标题",
      required: true,
    },
    {
      name: "content",
      label: "正文",
      type: "textarea",
      placeholder: "请输入正文内容",
      required: true,
      rows: 6,
    },
    {
      name: "attachment",
      label: "附件",
      type: "file",
      displayOnly: true,
    },
  ],
  publish: [
    {
      name: "scriptName",
      label: "剧本名",
      type: "text",
      placeholder: "请输入剧本名称",
      required: true,
    },
    {
      name: "genre",
      label: "题材",
      type: "select",
      options: GENRE_OPTIONS,
      required: true,
    },
    {
      name: "playerCount",
      label: "人数",
      type: "select",
      options: PLAYER_COUNT_OPTIONS,
      required: true,
    },
    {
      name: "duration",
      label: "时长",
      type: "select",
      options: DURATION_OPTIONS,
      required: true,
    },
    {
      name: "intro",
      label: "简介",
      type: "textarea",
      placeholder: "请输入剧本简介（选填）",
      rows: 5,
    },
  ],
  carpool: [
    {
      name: "scriptName",
      label: "剧本名",
      type: "text",
      placeholder: "请输入剧本名称",
      required: true,
    },
    {
      name: "time",
      label: "时间",
      type: "datetime",
      required: true,
    },
    {
      name: "location",
      label: "地点",
      type: "text",
      placeholder: "请输入拼车地点",
      required: true,
    },
    {
      name: "playerCount",
      label: "人数",
      type: "select",
      options: PLAYER_COUNT_OPTIONS,
      required: true,
    },
    {
      name: "remark",
      label: "备注",
      type: "textarea",
      placeholder: "补充说明（选填）",
      rows: 4,
    },
  ],
  request: [
    {
      name: "scriptName",
      label: "剧本名",
      type: "text",
      placeholder: "请输入剧本名称",
      required: true,
    },
    {
      name: "description",
      label: "需求描述",
      type: "textarea",
      placeholder: "请描述你的需求",
      required: true,
      rows: 5,
    },
    {
      name: "expectedCount",
      label: "期望人数",
      type: "select",
      options: PLAYER_COUNT_OPTIONS,
      required: true,
    },
  ],
};

/** 类型 → 弹窗标题 */
const TITLE_MAP: Record<PublishType, string> = {
  submit: "投稿作品",
  publish: "发布剧本",
  carpool: "发起拼车",
  request: "求本组局",
};

/** 上传组件配置：开发期仅展示，禁止实际上传 */
const uploadProps: UploadProps = {
  beforeUpload: () => false,
  multiple: true,
};

/** 具备 dayjs format 方法的对象类型（避免引入 dayjs 类型） */
interface Formattable {
  format: (fmt: string) => string;
}

/** 判断是否为 dayjs 对象（鸭子类型） */
function isFormattable(value: unknown): value is Formattable {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { format?: unknown }).format === "function"
  );
}

/** 将表单值标准化为 Record<string, string> */
function normalizeValues(
  values: Record<string, unknown>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value == null) {
      result[key] = "";
    } else if (Array.isArray(value)) {
      // Upload 的 fileList
      result[key] = value
        .map((f: { name?: string }) => f?.name ?? "")
        .filter(Boolean)
        .join(", ");
    } else if (isFormattable(value)) {
      // dayjs 对象
      result[key] = value.format("YYYY-MM-DD HH:mm");
    } else if (typeof value === "string") {
      result[key] = value;
    } else {
      result[key] = String(value);
    }
  }
  return result;
}

/**
 * 发布弹窗组件
 *
 * 根据 type 渲染对应表单字段；点击「发布」触发表单校验，
 * 通过后调用 onSubmit 传入标准化数据，并自动关闭。
 */
export default function PublishModal({
  open,
  type,
  onClose,
  onSubmit,
}: PublishModalProps) {
  const [form] = Form.useForm();
  const fields = FIELD_CONFIGS[type];
  const title = useMemo(() => TITLE_MAP[type], [type]);

  /** 打开时或类型变化时重置表单 */
  useEffect(() => {
    if (open) {
      form.resetFields();
    }
  }, [open, type, form]);

  /** Modal 确认：触发表单提交与校验 */
  const handleOk = () => {
    form.submit();
  };

  /** 表单校验通过：标准化并提交 */
  const handleFinish = (values: Record<string, unknown>) => {
    onSubmit(normalizeValues(values));
  };

  /** 渲染单个字段控件 */
  const renderControl = (field: FieldConfig): React.ReactNode => {
    switch (field.type) {
      case "textarea":
        return (
          <Input.TextArea
            placeholder={field.placeholder}
            rows={field.rows ?? 3}
            autoSize={{ minRows: field.rows ?? 3 }}
          />
        );
      case "select":
        return (
          <Select
            placeholder={field.placeholder ?? "请选择"}
            options={field.options}
            allowClear={!field.required}
          />
        );
      case "datetime":
        return (
          <DatePicker
            showTime
            format="YYYY-MM-DD HH:mm"
            style={{ width: "100%" }}
            placeholder="请选择时间"
          />
        );
      case "file":
        return (
          <Upload.Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">开发期仅展示，不会真实上传</p>
          </Upload.Dragger>
        );
      case "text":
      default:
        return <Input placeholder={field.placeholder} />;
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      okText="发布"
      cancelText="取消"
      onOk={handleOk}
      onCancel={onClose}
      destroyOnHidden
      mask={{ closable: false }}
      width={560}
      zIndex={1001}
      className="publish-modal"
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        preserve={false}
        requiredMark="optional"
      >
        {fields.map((field) => (
          <Form.Item
            key={field.name}
            name={field.name}
            label={field.label}
            rules={
              field.required && !field.displayOnly
                ? [{ required: true, message: `请填写${field.label}` }]
                : undefined
            }
          >
            {renderControl(field)}
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}
