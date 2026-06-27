import React from "react";
import { Input as AntInput } from "antd";

interface InputProps {
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
  showCount?: boolean;
  allowClear?: boolean;
  multiline?: boolean;
  rows?: number;
  className?: string;
}

/**
 * 叙光统一输入框组件
 * 支持单行/多行模式
 */
export function Input({
  placeholder,
  value,
  defaultValue,
  onChange,
  disabled = false,
  maxLength,
  showCount = false,
  allowClear = true,
  multiline = false,
  rows = 3,
  className,
}: InputProps) {
  if (multiline) {
    return (
      <AntInput.TextArea
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        showCount={showCount}
        allowClear={allowClear}
        autoSize={{ minRows: rows }}
        className={className}
      />
    );
  }

  return (
    <AntInput
      placeholder={placeholder}
      value={value}
      defaultValue={defaultValue}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      maxLength={maxLength}
      showCount={showCount}
      allowClear={allowClear}
      className={className}
    />
  );
}
