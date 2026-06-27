/**
 * 统一 API 响应与错误处理封装
 *
 * 提供：
 * - ApiError 业务错误类
 * - successResponse / errorResponse 响应体构造函数
 * - withErrorHandler 高阶函数，包装路由处理器以自动捕获异常
 */

import { NextResponse } from "next/server";

/**
 * 业务错误类，携带错误码与 HTTP 状态码
 */
export class ApiError extends Error {
  /**
   * @param code 错误码（如 NOT_FOUND、QUOTA_EXCEEDED）
   * @param message 错误信息
   * @param statusCode HTTP 状态码，默认 400
   */
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** 成功响应体 */
export interface SuccessResponse<T> {
  success: true;
  data: T;
}

/** 错误响应体 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * 构造成功响应
 * @param data 业务数据
 */
export function successResponse<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}

/**
 * 构造错误响应
 * @param code 错误码
 * @param message 错误信息
 * @param details 可选的附加详情
 */
export function errorResponse(
  code: string,
  message: string,
  details?: unknown,
): ErrorResponse {
  return { success: false, error: { code, message, details } };
}

/**
 * 高阶函数：包装 async 路由处理器，自动捕获异常并返回统一的 JSON 响应。
 * - 捕获 ApiError 时返回其携带的 statusCode
 * - 捕获其他异常时返回 500
 *
 * @param fn 原始路由处理函数
 * @returns 包装后的处理函数
 */
export function withErrorHandler<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<NextResponse | Response>,
): (...args: TArgs) => Promise<NextResponse | Response> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json(
          errorResponse(error.code, error.message),
          { status: error.statusCode },
        );
      }
      const message =
        error instanceof Error ? error.message : "Internal server error";
      return NextResponse.json(
        errorResponse("INTERNAL_ERROR", message),
        { status: 500 },
      );
    }
  };
}
