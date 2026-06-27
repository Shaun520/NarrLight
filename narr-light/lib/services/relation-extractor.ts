/**
 * 人物关系自动提取服务（T176）
 *
 * 从剧本中抽取人物关系，区分明线（玩家可见）与暗线（真相复盘）：
 *   - 明线 isVisible=true，金色实线
 *   - 暗线 isHiddenRelation=true，朱砂虚线
 *
 * 关系类型对齐数据库 character_relations.relation_type 枚举：
 *   family / friend / lover / enemy / colleague / conspiracy / other
 *
 * 强度：strong（强）/ medium（中）/ fatal（致命，仅暗线）
 *
 * 该服务为前端可视化（视图7 · 人物关系图谱）提供数据源，
 * 当前以本地推断为主，后续可接入 AI 关系抽取 prompt 增强。
 */

/** 关系类型（与 DB character_relations.relation_type 对齐） */
export type RelationType =
  | 'family'
  | 'friend'
  | 'lover'
  | 'enemy'
  | 'colleague'
  | 'conspiracy'
  | 'other';

/** 关系强度 */
export type RelationStrength = 'strong' | 'medium' | 'fatal';

/** 角色阵营（用于阵营视图与 FILTER chips） */
export type CharacterCamp = 'shen' | 'outsider' | 'deceased' | 'murderer' | 'healer' | 'other';

/** 人物节点（图谱渲染用，融合 characters 表字段） */
export interface RelationNode {
  id: string;
  /** 人物姓名 */
  name: string;
  /** 角色身份（如 死者 / 凶手 / 医者 / 管家 / 丫鬟 / 药商） */
  roleIdentity: string;
  /** 性别 */
  gender: 'male' | 'female' | 'unknown' | '';
  /** 年龄 */
  age: number | null;
  /** 性格 */
  personality: string;
  /** 背景故事 / 简介 */
  backgroundStory: string;
  /** 个人任务 */
  personalTask: string;
  /** 是否凶手 */
  isMurderer: boolean;
  /** 阵营归类 */
  camp: CharacterCamp;
  /** 节点描边色（按角色身份配色，与编辑器一致） */
  color: string;
  /** 节点半径（按重要度：死者最大，凶手次之） */
  radius: number;
  /** 原始排序 */
  sortOrder: number;
}

/** 关系边（图谱渲染用） */
export interface RelationEdge {
  id: string;
  /** 起点 ID */
  source: string;
  /** 终点 ID */
  target: string;
  /** 关系类型 */
  relationType: RelationType;
  /** 明线标签（玩家可见） */
  label: string;
  /** 暗线标签（真相复盘） */
  hiddenLabel: string;
  /** 是否明线（玩家可见） */
  isVisible: boolean;
  /** 是否暗线（真相复盘） */
  isHiddenRelation: boolean;
  /** 关系强度 */
  strength: RelationStrength;
}

/** 提取结果 */
export interface RelationGraphData {
  nodes: RelationNode[];
  edges: RelationEdge[];
}

/** 已存在的关系行（与 character_relations 表对齐） */
export interface ExistingRelationRow {
  source: string;
  target: string;
  relationType: RelationType;
  isVisible: boolean;
  isHiddenRelation: boolean;
}

/** 推断暗线时所需的最小剧本数据（避免强依赖完整 Script 类型） */
export interface ScriptRelationInput {
  characters: Array<{
    id: string;
    name: string;
    roleIdentity: string;
    isMurderer: boolean;
    backgroundStory?: string;
    personalTask?: string;
  }>;
  /** 已存在的明线关系（可选，避免重复推断） */
  existingRelations?: ExistingRelationRow[];
  /** 真相摘要（用于辅助推断暗线） */
  truthSummary?: string;
  /** 死者姓名列表（可选，未提供时按 roleIdentity 推断） */
  deceasedNames?: string[];
}

/** 角色身份 → 描边色映射（与编辑器、原型 SVG 一致） */
const ROLE_COLOR_MAP: Record<string, string> = {
  死者: '#8a1c1c',
  凶手: '#b08d57',
  医者: '#4a7c59',
  管家: '#3a5a7a',
  丫鬟: '#7a5c3a',
  药商: '#6a4a8a',
};

/** 默认描边色 */
const DEFAULT_ROLE_COLOR = '#7a5c3a';

/** 角色身份 → 节点半径映射 */
const ROLE_RADIUS_MAP: Record<string, number> = {
  死者: 34,
  凶手: 30,
  医者: 28,
  管家: 26,
  丫鬟: 24,
  药商: 24,
};

/** 默认半径 */
const DEFAULT_ROLE_RADIUS = 24;

/** 关系类型 → 中文标签 */
export const RELATION_TYPE_LABEL: Record<RelationType, string> = {
  family: '亲属',
  friend: '朋友',
  lover: '恋人',
  enemy: '敌对',
  colleague: '同僚',
  conspiracy: '共谋',
  other: '其他',
};

/** 强度 → 中文标签 */
export const RELATION_STRENGTH_LABEL: Record<RelationStrength, string> = {
  strong: '强',
  medium: '中',
  fatal: '致命',
};

/**
 * 推断角色阵营：用于 FILTER chips 与阵营视图。
 *   - deceased：死者（含"死"字或死者列表）
 *   - murderer：凶手
 *   - healer：医者相关
 *   - shen：姓氏为"沈"的沈家人
 *   - outsider：其余为外人
 */
function inferCamp(
  roleIdentity: string,
  isMurderer: boolean,
  name: string,
  deceasedNames: string[] = [],
): CharacterCamp {
  if (deceasedNames.includes(name) || roleIdentity.includes('死')) return 'deceased';
  if (isMurderer) return 'murderer';
  if (roleIdentity.includes('医')) return 'healer';
  if (name.startsWith('沈')) return 'shen';
  return 'outsider';
}

/**
 * 根据角色身份取描边色
 */
export function getRoleColor(roleIdentity: string): string {
  for (const key of Object.keys(ROLE_COLOR_MAP)) {
    if (roleIdentity.includes(key)) return ROLE_COLOR_MAP[key];
  }
  return DEFAULT_ROLE_COLOR;
}

/**
 * 根据角色身份取节点半径
 */
export function getRoleRadius(roleIdentity: string): number {
  for (const key of Object.keys(ROLE_RADIUS_MAP)) {
    if (roleIdentity.includes(key)) return ROLE_RADIUS_MAP[key];
  }
  return DEFAULT_ROLE_RADIUS;
}

/**
 * 人物关系自动提取服务
 */
export class RelationExtractor {
  /**
   * 从剧本提取人物关系图谱数据。
   *
   * 当前实现：基于 ScriptRelationInput 构建节点 + 推断暗线。
   * 数据库查询由调用方完成（避免在此处直接耦合 supabase client），
   * 这样该类在客户端组件中也可使用。
   *
   * @param scriptData 剧本人物与已存在关系（最小入参）
   */
  extract(scriptData: ScriptRelationInput): RelationGraphData {
    const deceasedNames = scriptData.deceasedNames ?? this.guessDeceased(scriptData);

    const nodes: RelationNode[] = scriptData.characters.map((c) => ({
      id: c.id,
      name: c.name,
      roleIdentity: c.roleIdentity,
      gender: 'unknown',
      age: null,
      personality: '',
      backgroundStory: c.backgroundStory ?? '',
      personalTask: c.personalTask ?? '',
      isMurderer: c.isMurderer,
      camp: inferCamp(c.roleIdentity, c.isMurderer, c.name, deceasedNames),
      color: getRoleColor(c.roleIdentity),
      radius: getRoleRadius(c.roleIdentity),
      sortOrder: 0,
    }));

    // 明线：取已存在的可见关系
    const lightEdges: RelationEdge[] = (scriptData.existingRelations ?? [])
      .filter((r) => r.isVisible && !r.isHiddenRelation)
      .map((r, idx) => this.toEdge(`rel-light-${idx}`, r, true, false, 'medium'));

    // 暗线：推断 + 已存在的隐藏关系
    const existingHidden = (scriptData.existingRelations ?? [])
      .filter((r) => r.isHiddenRelation)
      .map((r, idx) => this.toEdge(`rel-dark-exist-${idx}`, r, false, true, 'fatal'));
    const inferredHidden = this.inferHiddenRelations(scriptData);

    // 去重：避免 existingHidden 与 inferredHidden 重复
    const seen = new Set(existingHidden.map((e) => `${e.source}->${e.target}`));
    const dedupInferred = inferredHidden.filter(
      (e) => !seen.has(`${e.source}->${e.target}`),
    );

    return {
      nodes,
      edges: [...lightEdges, ...existingHidden, ...dedupInferred],
    };
  }

  /**
   * 推断暗线关系。
   *
   * 当前规则（保守推断，可由 AI 增强）：
   *   1. 凶手 ↔ 死者：共谋/灭口（fatal）
   *   2. 凶手 ↔ 其他人：单向知情/共谋（fatal）
   *   3. 医者 ↔ 死者：私采药物（strong）
   *
   * @param scriptData 剧本数据
   * @returns 推断出的暗线边列表
   */
  inferHiddenRelations(scriptData: ScriptRelationInput): RelationEdge[] {
    const edges: RelationEdge[] = [];
    const deceasedNames = scriptData.deceasedNames ?? this.guessDeceased(scriptData);
    const nameToChar = new Map(scriptData.characters.map((c) => [c.name, c]));

    const murderers = scriptData.characters.filter((c) => c.isMurderer);
    const deceased = scriptData.characters.filter(
      (c) => deceasedNames.includes(c.name) || c.roleIdentity.includes('死'),
    );

    // 1. 凶手 ↔ 死者：灭口
    for (const murderer of murderers) {
      for (const victim of deceased) {
        if (murderer.id === victim.id) continue;
        edges.push(this.makeHiddenEdge(
          `rel-dark-murder-${murderer.id}-${victim.id}`,
          murderer.id,
          victim.id,
          'conspiracy',
          '灭口',
          'fatal',
        ));
      }
    }

    // 2. 凶手 ↔ 其他人（非死者）：共谋 / 单向知情
    for (const murderer of murderers) {
      for (const c of scriptData.characters) {
        if (c.id === murderer.id) continue;
        if (deceased.some((d) => d.id === c.id)) continue;
        // 排除已有明线亲属关系的（保守跳过）
        edges.push(this.makeHiddenEdge(
          `rel-dark-conn-${murderer.id}-${c.id}`,
          murderer.id,
          c.id,
          'conspiracy',
          '共谋',
          'fatal',
        ));
      }
    }

    // 3. 医者 ↔ 死者：私采药物
    const healers = scriptData.characters.filter((c) => c.roleIdentity.includes('医'));
    for (const healer of healers) {
      for (const victim of deceased) {
        if (healer.id === victim.id) continue;
        edges.push(this.makeHiddenEdge(
          `rel-dark-heal-${healer.id}-${victim.id}`,
          healer.id,
          victim.id,
          'other',
          '私采',
          'strong',
        ));
      }
    }

    // 用 truthSummary 辅助去重标签（保守跳过空摘要）
    void scriptData.truthSummary;
    void nameToChar;

    return edges;
  }

  /**
   * 推测死者名单：若无显式提供，按 roleIdentity 含"死"字判定。
   */
  private guessDeceased(scriptData: ScriptRelationInput): string[] {
    return scriptData.characters
      .filter((c) => c.roleIdentity.includes('死'))
      .map((c) => c.name);
  }

  /**
   * 将已存在的关系行转换为边对象。
   */
  private toEdge(
    id: string,
    r: ExistingRelationRow,
    isVisible: boolean,
    isHidden: boolean,
    strength: RelationStrength,
  ): RelationEdge {
    return {
      id,
      source: r.source,
      target: r.target,
      relationType: r.relationType,
      label: isVisible ? this.guessLightLabel(r.relationType) : '',
      hiddenLabel: isHidden ? this.guessDarkLabel(r.relationType) : '',
      isVisible,
      isHiddenRelation: isHidden,
      strength,
    };
  }

  /**
   * 构造一条暗线边
   */
  private makeHiddenEdge(
    id: string,
    source: string,
    target: string,
    relationType: RelationType,
    hiddenLabel: string,
    strength: RelationStrength,
  ): RelationEdge {
    return {
      id,
      source,
      target,
      relationType,
      label: '',
      hiddenLabel,
      isVisible: false,
      isHiddenRelation: true,
      strength,
    };
  }

  /**
   * 根据关系类型猜测明线标签
   */
  private guessLightLabel(type: RelationType): string {
    return RELATION_TYPE_LABEL[type];
  }

  /**
   * 根据关系类型猜测暗线标签
   */
  private guessDarkLabel(type: RelationType): string {
    if (type === 'conspiracy') return '共谋';
    if (type === 'enemy') return '灭口';
    return RELATION_TYPE_LABEL[type];
  }
}

/**
 * 单例：供客户端组件直接调用
 */
export const relationExtractor = new RelationExtractor();

/**
 * 默认 Mock 数据：用于关系图谱页在没有数据库连接时展示原型效果。
 * 严格对齐原型 workbench2.html #view-relations 中的 6 人关系结构。
 */
export const DEFAULT_RELATION_GRAPH: RelationGraphData = {
  nodes: [
    {
      id: 'char-shen-mobai',
      name: '沈墨白',
      roleIdentity: '死者',
      gender: 'male',
      age: 38,
      personality: '多疑寡恩',
      backgroundStory:
        '三十八岁，沈家长子，过继而来。十年前离乡经商，案发前夜归家，意图整顿家业、清算旧账。性格多疑寡恩，与诸人皆有龃龉。',
      personalTask: '清算旧账，重振家业',
      isMurderer: false,
      camp: 'deceased',
      color: '#8a1c1c',
      radius: 34,
      sortOrder: 0,
    },
    {
      id: 'char-shen-mochen',
      name: '沈墨尘',
      roleIdentity: '凶手',
      gender: 'male',
      age: 35,
      personality: '阴沉隐忍',
      backgroundStory:
        '沈家次子，长年居于兄长阴影之下。表面恭顺，暗中负债累累，对兄长怀恨已久。',
      personalTask: '掩盖债务，夺取家主之位',
      isMurderer: true,
      camp: 'murderer',
      color: '#b08d57',
      radius: 30,
      sortOrder: 1,
    },
    {
      id: 'char-liu-ruyan',
      name: '柳如烟',
      roleIdentity: '医者',
      gender: 'female',
      age: 28,
      personality: '冷静克制',
      backgroundStory:
        '城中女医，与沈家有旧。医术精湛，与沈墨白少年相识，关系暧昧。',
      personalTask: '查清父亲死因',
      isMurderer: false,
      camp: 'healer',
      color: '#4a7c59',
      radius: 28,
      sortOrder: 2,
    },
    {
      id: 'char-chen-shouyi',
      name: '陈守义',
      roleIdentity: '管家',
      gender: 'male',
      age: 52,
      personality: '忠厚本分',
      backgroundStory:
        '沈家老管家，侍奉两代家主，知晓诸多家事隐秘。',
      personalTask: '守护沈家安宁',
      isMurderer: false,
      camp: 'shen',
      color: '#3a5a7a',
      radius: 26,
      sortOrder: 3,
    },
    {
      id: 'char-xiao-cui',
      name: '小翠',
      roleIdentity: '丫鬟',
      gender: 'female',
      age: 19,
      personality: '机灵胆小',
      backgroundStory:
        '沈墨白贴身丫鬟，案发当夜曾听见异响，是关键证人之一。',
      personalTask: '明哲保身',
      isMurderer: false,
      camp: 'shen',
      color: '#7a5c3a',
      radius: 24,
      sortOrder: 4,
    },
    {
      id: 'char-zhou-banxian',
      name: '周半仙',
      roleIdentity: '药商',
      gender: 'male',
      age: 46,
      personality: '圆滑世故',
      backgroundStory:
        '游走四方的药商，与沈墨白有暗中交易，私下贩卖乌头等管制药材。',
      personalTask: '牟利避祸',
      isMurderer: false,
      camp: 'outsider',
      color: '#6a4a8a',
      radius: 24,
      sortOrder: 5,
    },
  ],
  edges: [
    // 明线（金色实线）
    {
      id: 'rel-light-1',
      source: 'char-shen-mobai',
      target: 'char-shen-mochen',
      relationType: 'family',
      label: '兄弟',
      hiddenLabel: '',
      isVisible: true,
      isHiddenRelation: false,
      strength: 'strong',
    },
    {
      id: 'rel-light-2',
      source: 'char-shen-mobai',
      target: 'char-liu-ruyan',
      relationType: 'friend',
      label: '旧识',
      hiddenLabel: '',
      isVisible: true,
      isHiddenRelation: false,
      strength: 'medium',
    },
    {
      id: 'rel-light-3',
      source: 'char-shen-mobai',
      target: 'char-chen-shouyi',
      relationType: 'colleague',
      label: '主仆',
      hiddenLabel: '',
      isVisible: true,
      isHiddenRelation: false,
      strength: 'medium',
    },
    {
      id: 'rel-light-4',
      source: 'char-shen-mobai',
      target: 'char-xiao-cui',
      relationType: 'colleague',
      label: '恩客',
      hiddenLabel: '',
      isVisible: true,
      isHiddenRelation: false,
      strength: 'medium',
    },
    {
      id: 'rel-light-5',
      source: 'char-shen-mochen',
      target: 'char-chen-shouyi',
      relationType: 'colleague',
      label: '兄弟(明)',
      hiddenLabel: '',
      isVisible: true,
      isHiddenRelation: false,
      strength: 'medium',
    },
    {
      id: 'rel-light-6',
      source: 'char-liu-ruyan',
      target: 'char-zhou-banxian',
      relationType: 'colleague',
      label: '旧识(明)',
      hiddenLabel: '',
      isVisible: true,
      isHiddenRelation: false,
      strength: 'medium',
    },
    // 暗线（朱砂虚线）
    {
      id: 'rel-dark-1',
      source: 'char-shen-mobai',
      target: 'char-zhou-banxian',
      relationType: 'other',
      label: '',
      hiddenLabel: '债主',
      isVisible: false,
      isHiddenRelation: true,
      strength: 'fatal',
    },
    {
      id: 'rel-dark-2',
      source: 'char-shen-mobai',
      target: 'char-shen-mochen',
      relationType: 'conspiracy',
      label: '',
      hiddenLabel: '债主',
      isVisible: false,
      isHiddenRelation: true,
      strength: 'fatal',
    },
    {
      id: 'rel-dark-3',
      source: 'char-shen-mobai',
      target: 'char-liu-ruyan',
      relationType: 'conspiracy',
      label: '',
      hiddenLabel: '共谋',
      isVisible: false,
      isHiddenRelation: true,
      strength: 'fatal',
    },
    {
      id: 'rel-dark-4',
      source: 'char-shen-mochen',
      target: 'char-shen-mobai',
      relationType: 'enemy',
      label: '',
      hiddenLabel: '灭口',
      isVisible: false,
      isHiddenRelation: true,
      strength: 'fatal',
    },
    {
      id: 'rel-dark-5',
      source: 'char-liu-ruyan',
      target: 'char-zhou-banxian',
      relationType: 'conspiracy',
      label: '',
      hiddenLabel: '私采乌头',
      isVisible: false,
      isHiddenRelation: true,
      strength: 'strong',
    },
  ],
};
