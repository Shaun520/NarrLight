/**
 * 线索自动解析与分类服务（T163）
 *
 * 从剧本正文自动提取线索候选，并按内容分类：
 *   - physical  物证（实体道具）
 *   - testimony 口供（人物陈述）
 *   - deep      深入线索（需解锁 / 隐含信息）
 *   - hidden    隐藏线索（暗藏 / 伪装）
 *
 * 同时按章节（幕次）与地点归类，供 ClueService 持久化与线索卡管理页展示。
 *
 * 依赖数据库表：
 *   - script_contents（id / script_id / content JSON）
 *     content 结构宽松，本服务递归抽取其中的字符串字段作为正文语料。
 *
 * 注：script_contents 表尚未在 lib/supabase/types.ts 中声明，本服务以行接口显式定义，
 *     待迁移脚本创建表后再同步至 supabase/types.ts。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api/response';
import type { Json } from '@/lib/supabase/types';
import type { ClueAct, CluePhase, ClueType } from '@/components/clue-card/clue-card';

/** 线索候选项（尚未持久化） */
export interface ClueCandidate {
  /** 候选正文 */
  text: string;
  /** 内容分类 */
  type: ClueType;
  /** 提取到的搜证地点（可能为空） */
  location: string | null;
  /** 推断幕次（默认 act1） */
  act: ClueAct;
  /** 推断环节（默认 public） */
  phase: CluePhase;
}

/** script_contents 行结构 */
interface ScriptContentRow {
  id: string;
  script_id: string;
  content: Json;
}

/** 幕次推断关键词 → act 映射（按出现顺序匹配） */
const ACT_KEYWORDS: { act: ClueAct; keywords: string[] }[] = [
  { act: 'act1', keywords: ['第一幕', '序幕', '开场', '开篇'] },
  { act: 'act2', keywords: ['第二幕', '搜证', '搜查', '调查'] },
  { act: 'act3', keywords: ['第三幕', '圆桌', '讨论', '对质'] },
  { act: 'truth', keywords: ['真相', '复盘', '结局', '尾声'] },
];

/** 物证关键词 */
const PHYSICAL_KW = [
  '信', '纸', '帕', '钥匙', '借据', '账册', '草药', '族谱', '刀', '瓶', '盒', '匣',
  '表', '图', '书', '笺', '函', '戒指', '玉', '珠', '簪', '剑', '毒', '药', '锁',
  '页', '残页', '绣', '物', '器', '架', '木匣', '铜', '票据', '日记', '笔记', '照片',
];
/** 口供关键词 */
const TESTIMONY_KW = [
  '证词', '口供', '供述', '陈述', '笔录', '证言', '回忆', '讲述', '答道', '说道',
  '称', '表示', '坦言', '据', '说', '言', '道', '答',
];
/** 深入线索关键词 */
const DEEP_KW = [
  '暗格', '夹层', '密', '底', '背后', '真相', '深入', '隐', '秘', '暗',
  '解码', '解锁', '藏', '匿', '暗藏', '隐秘', '深层', '底下', '内含', '内藏',
];
/** 隐藏线索关键词 */
const HIDDEN_KW = [
  '隐藏', '暗藏', '藏', '匿', '私', '夹', '伪装', '假', '未署名', '匿名', '隐匿', '潜藏',
  '不为人知', '暗中', '私自',
];

/** 搜证地点正则（命名捕获优先，回退到地点名词典） */
const LOCATION_PATTERNS: RegExp[] = [
  /位于(.{2,10}?)(?=[，。；,;.])/,
  /在(.{2,8}?)(?:发现|找到|搜出|搜得|藏有|藏于|发现于|找到于|搜得于)/,
  /(?:发现|找到|搜得|搜出|藏有)于(.{2,8}?)(?=[，。；,;.])/,
];
const LOCATION_WORDS = [
  '祠堂', '厢房', '书房', '暗格', '寝室', '药铺', '后院', '柜台', '码头', '茶楼',
  '雅间', '灵堂', '沈宅', '柳宅', '街', '巷', '桥', '阁', '楼', '室', '房', '院',
  '堂', '铺', '库', '仓', '厨', '厅',
];

/** 发现类动词，用于判定句子是否像线索描述 */
const DISCOVERY_VERBS = ['发现', '找到', '搜得', '搜出', '藏有', '内有', '内藏', '夹有', '遗留', '残留'];

/** 计算文本在各分类上的命中数 */
function scoreCategory(text: string): Record<ClueType, number> {
  const score: Record<ClueType, number> = { physical: 0, testimony: 0, deep: 0, hidden: 0 };
  for (const k of PHYSICAL_KW) if (text.includes(k)) score.physical += 1;
  for (const k of TESTIMONY_KW) if (text.includes(k)) score.testimony += 1;
  for (const k of DEEP_KW) if (text.includes(k)) score.deep += 1;
  for (const k of HIDDEN_KW) if (text.includes(k)) score.hidden += 1;
  return score;
}

/** 按句子拆分（中文标点 + 换行） */
function splitSentences(blob: string): string[] {
  return blob
    .split(/[。\n！？!?；;]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6 && s.length <= 120);
}

/** 递归收集 JSON 中的所有字符串值 */
function collectStrings(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, out);
    return;
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) collectStrings(v, out);
  }
}

/**
 * 线索自动解析与分类服务
 */
export class ClueExtractor {
  /**
   * 从剧本正文自动提取线索候选。
   * 读取 script_contents.content，递归抽取字符串，按句子拆分后分类。
   * @param scriptId 剧本 ID
   * @throws {ApiError} DB_QUERY_ERROR 当读取剧本正文失败时抛出 (500)
   */
  async extract(scriptId: string): Promise<ClueCandidate[]> {
    const supabase = await this.getServerClient();
    const { data, error } = await supabase
      .from('script_contents')
      .select('id, script_id, content')
      .eq('script_id', scriptId)
      .maybeSingle();

    if (error) {
      throw new ApiError('DB_QUERY_ERROR', `读取剧本正文失败: ${error.message}`, 500);
    }
    if (!data) return [];

    const row = data as unknown as ScriptContentRow;
    const blobs: string[] = [];
    collectStrings(row.content, blobs);
    const fullText = blobs.join('\n');

    // 推断整体幕次（取首个命中的幕次关键词）
    const detectedAct: ClueAct = ACT_KEYWORDS.find((a) =>
      a.keywords.some((k) => fullText.includes(k)),
    )?.act ?? 'act1';

    const candidates: ClueCandidate[] = [];
    for (const sentence of splitSentences(fullText)) {
      const type = this.classifyClue(sentence);
      const location = this.extractLocation(sentence);
      // 仅保留像线索的句子：分类命中或含发现动词
      const score = scoreCategory(sentence);
      const totalHit = score.physical + score.testimony + score.deep + score.hidden;
      const hasDiscovery = DISCOVERY_VERBS.some((v) => sentence.includes(v));
      if (totalHit === 0 && !hasDiscovery) continue;

      // 含深入/隐藏关键词时覆盖默认 act
      const act: ClueAct =
        ACT_KEYWORDS.find((a) => a.keywords.some((k) => sentence.includes(k)))?.act ?? detectedAct;

      // 推断环节：含"私有/随身/贴身"→ private；含"关键/核心"→ key；含"干扰/误导"→ trap
      let phase: CluePhase = 'public';
      if (/私有|随身|贴身|个人/.test(sentence)) phase = 'private';
      else if (/关键|核心/.test(sentence)) phase = 'key';
      else if (/干扰|误导|无关/.test(sentence)) phase = 'trap';

      candidates.push({ text: sentence, type, location, act, phase });
      if (candidates.length >= 200) break;
    }
    return candidates;
  }

  /**
   * 根据文本特征分类线索内容。
   * 取四类关键词命中数最高者；并列时优先级 hidden > deep > testimony > physical。
   * @param text 线索文本
   */
  classifyClue(text: string): ClueType {
    const score = scoreCategory(text);
    const order: ClueType[] = ['hidden', 'deep', 'testimony', 'physical'];
    let best: ClueType = 'physical';
    let bestScore = -1;
    for (const t of order) {
      if (score[t] > bestScore) {
        bestScore = score[t];
        best = t;
      }
    }
    if (bestScore === 0) return 'physical';
    return best;
  }

  /**
   * 从文本中提取搜证地点。
   * 依次尝试命名正则、地点动词模式、地点名词典匹配。
   * @param text 线索文本
   * @returns 地点名，未匹配时返回 null
   */
  extractLocation(text: string): string | null {
    for (const re of LOCATION_PATTERNS) {
      const m = text.match(re);
      if (m && m[1]) {
        const loc = m[1].trim();
        if (loc.length >= 2) return loc;
      }
    }
    for (const w of LOCATION_WORDS) {
      if (text.includes(w)) return w;
    }
    return null;
  }

  // ===== 内部工具方法 =====

  /** 动态导入服务端 Supabase Client（避免 next/headers 进入客户端 bundle） */
  private async getServerClient(): Promise<SupabaseClient> {
    const { createClient } = await import('@/lib/supabase/server');
    return createClient();
  }
}

/** 服务单例（无状态，可直接复用） */
export const clueExtractor = new ClueExtractor();
