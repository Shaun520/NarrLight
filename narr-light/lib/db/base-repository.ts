/**
 * Supabase 数据访问层基类
 *
 * 封装通用 CRUD 操作，子类可继承并扩展业务方法。
 * 构造函数接受表名与可选的 Supabase 客户端；
 * 未传入客户端时默认使用浏览器端 client（client.ts 不依赖 next/headers，
 * 可安全在 SSR 环境中导入，避免服务端模块耦合）。
 *
 * 注：Supabase 类型化客户端对泛型表名 T 的类型推断存在限制，
 * 此处通过宽松查询构建器类型（LooseTableQuery / LooseFilterQuery）
 * 绕过严格列名校验，行/插入/更新类型仍由 Database 类型保证。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { ApiError } from "@/lib/api/response";

/** 数据库表名 */
type TableName = keyof Database["public"]["Tables"];
/** 表行类型 */
type RowType<T extends TableName> = Database["public"]["Tables"][T]["Row"];
/** 表插入类型 */
type InsertType<T extends TableName> =
  Database["public"]["Tables"][T]["Insert"];
/** 表更新类型 */
type UpdateType<T extends TableName> =
  Database["public"]["Tables"][T]["Update"];

/** 过滤条件对象，键为列名，值为期望相等的值 */
type Filters = Record<string, unknown>;

/** 数据库错误结构（PostgrestError 的最小子集） */
interface DbError {
  code: string;
  message: string;
}

/** 单行查询结果 */
interface SingleResult<T> {
  data: T | null;
  error: DbError | null;
}

/** 列表查询结果 */
interface ListResult<T> {
  data: T[] | null;
  error: DbError | null;
  count: number | null;
}

/**
 * 宽松的过滤查询构建器。
 * 继承 PromiseLike 以支持 await，解析为 ListResult。
 */
interface LooseFilterQuery<T> extends PromiseLike<ListResult<T>> {
  select(
    columns?: string,
    options?: { count?: "exact"; head?: boolean },
  ): LooseFilterQuery<T>;
  eq(column: string, value: unknown): LooseFilterQuery<T>;
  order(column: string, options?: { ascending?: boolean }): LooseFilterQuery<T>;
  range(from: number, to: number): LooseFilterQuery<T>;
  single(): Promise<SingleResult<T>>;
}

/** 宽松的表查询入口 */
interface LooseTableQuery<T> {
  select(
    columns?: string,
    options?: { count?: "exact"; head?: boolean },
  ): LooseFilterQuery<T>;
  insert(values: unknown): LooseFilterQuery<T>;
  update(values: unknown): LooseFilterQuery<T>;
  delete(): LooseFilterQuery<T>;
}

/** findAll 查询选项 */
export interface FindAllOptions {
  /** 等值过滤条件 */
  filters?: Filters;
  /** 页码，从 1 开始，默认 1 */
  page?: number;
  /** 每页条数，默认 20 */
  pageSize?: number;
  /** 排序规则 */
  orderBy?: { column: string; ascending?: boolean };
}

/** 分页查询结果 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Supabase 数据访问层基类
 */
export class BaseRepository<T extends TableName> {
  protected client: SupabaseClient<Database>;
  protected tableName: T;

  /**
   * @param tableName 表名
   * @param client 可选的 Supabase 客户端；未传入时默认使用浏览器端 client
   */
  constructor(tableName: T, client?: SupabaseClient<Database>) {
    this.tableName = tableName;
    this.client =
      client ??
      (createBrowserClient() as unknown as SupabaseClient<Database>);
  }

  /**
   * 获取当前表的查询入口（宽松类型，绕过泛型 T 的严格类型推断限制）。
   */
  protected table(): LooseTableQuery<T> {
    return this.client.from(this.tableName) as unknown as LooseTableQuery<T>;
  }

  /**
   * 根据主键 ID 查询单条记录。
   * 记录不存在时抛出 NOT_FOUND (404) 错误。
   * @param id 主键 ID
   */
  async findById(id: string): Promise<RowType<T>> {
    const { data, error } = await this.table()
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new ApiError("NOT_FOUND", `记录不存在: ${id}`, 404);
      }
      throw new ApiError("DB_QUERY_ERROR", error.message, 500);
    }
    return data as unknown as RowType<T>;
  }

  /**
   * 分页查询多条记录，支持等值过滤与排序。
   * @param options 查询选项（过滤、分页、排序）
   */
  async findAll(
    options?: FindAllOptions,
  ): Promise<PaginatedResult<RowType<T>>> {
    const { filters, page = 1, pageSize = 20, orderBy } = options ?? {};

    let query = this.table().select("*", { count: "exact" });

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined) {
          query = query.eq(key, value);
        }
      }
    }

    if (orderBy) {
      query = query.order(orderBy.column, {
        ascending: orderBy.ascending ?? true,
      });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) throw new ApiError("DB_QUERY_ERROR", error.message, 500);

    return {
      data: (data ?? []) as unknown as RowType<T>[],
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  /**
   * 插入一条记录并返回新建的行。
   * @param data 插入数据
   */
  async insert(data: InsertType<T>): Promise<RowType<T>> {
    const { data: row, error } = await this.table()
      .insert(data)
      .select()
      .single();

    if (error) throw new ApiError("DB_INSERT_ERROR", error.message, 500);
    return row as unknown as RowType<T>;
  }

  /**
   * 根据主键 ID 更新记录并返回更新后的行。
   * @param id 主键 ID
   * @param data 更新数据
   */
  async update(id: string, data: UpdateType<T>): Promise<RowType<T>> {
    const { data: row, error } = await this.table()
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new ApiError("DB_UPDATE_ERROR", error.message, 500);
    return row as unknown as RowType<T>;
  }

  /**
   * 根据主键 ID 删除记录。
   * @param id 主键 ID
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.table().delete().eq("id", id);
    if (error) throw new ApiError("DB_DELETE_ERROR", error.message, 500);
  }

  /**
   * 统计满足过滤条件的记录数。
   * @param filters 等值过滤条件
   */
  async count(filters?: Filters): Promise<number> {
    let query = this.table().select("*", { count: "exact", head: true });

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined) {
          query = query.eq(key, value);
        }
      }
    }

    const { count, error } = await query;
    if (error) throw new ApiError("DB_COUNT_ERROR", error.message, 500);
    return count ?? 0;
  }
}
