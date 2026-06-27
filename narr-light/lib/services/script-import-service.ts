/**
 * 生成结果 JSON 解析与结构化入库
 *
 * 将 AI 返回的 GeneratedScriptJson 解析后分别写入：
 *   characters / acts / scenes / clues / character_relations 表
 *
 * 入库前由 validateGeneratedJson 做格式校验；
 * 人物名 → 人物 ID 的映射用于关联 clues.relatedCharacterIds 与 character_relations。
 */
import { createClient } from '@/lib/supabase/server';
import type { GeneratedScriptJson } from '@/lib/ai/prompts/script-generation';

/** 校验结果 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** 可恢复状态：已生成的内容与进度 */
export interface ImportResult {
  characters: number;
  acts: number;
  scenes: number;
  clues: number;
  relations: number;
}

export class ScriptImportService {
  /**
   * 解析 AI 返回的 JSON，分别写入 characters、acts、scenes、clues、character_relations 表。
   * @param scriptId      目标剧本 ID
   * @param generatedJson AI 返回的结构化 JSON
   */
  async importGeneratedScript(
    scriptId: string,
    generatedJson: GeneratedScriptJson,
  ): Promise<ImportResult> {
    const validation = this.validateGeneratedJson(generatedJson);
    if (!validation.valid) {
      throw new Error(`生成结果校验失败: ${validation.errors.join('; ')}`);
    }

    const supabase = await createClient();

    // 1. 写入 characters，建立 name → id 映射
    const nameToId = new Map<string, string>();
    let characterCount = 0;
    for (let i = 0; i < generatedJson.characters.length; i++) {
      const c = generatedJson.characters[i];
      const id = crypto.randomUUID();
      nameToId.set(c.name, id);
      const { error } = await supabase.from('characters').insert({
        id,
        script_id: scriptId,
        name: c.name,
        role_identity: c.roleIdentity,
        gender: c.gender,
        age: c.age,
        personality: c.personality,
        background_story: c.backgroundStory,
        personal_task: c.personalTask,
        is_murderer: c.isMurderer,
        sort_order: i,
      });
      if (error) throw new Error(`写入人物失败 (${c.name}): ${error.message}`);
      characterCount++;
    }

    // 2. 写入 acts 与级联 scenes
    let actCount = 0;
    let sceneCount = 0;
    for (const act of generatedJson.acts) {
      const actId = crypto.randomUUID();
      const { error: actErr } = await supabase.from('acts').insert({
        id: actId,
        script_id: scriptId,
        title: act.title,
        sort_order: act.sortOrder,
        content: act.content,
      });
      if (actErr) throw new Error(`写入幕次失败 (${act.title}): ${actErr.message}`);
      actCount++;

      for (const scene of act.scenes) {
        const { error: sceneErr } = await supabase.from('scenes').insert({
          id: crypto.randomUUID(),
          act_id: actId,
          title: scene.title,
          location: scene.location,
          content: scene.content,
          sort_order: scene.sortOrder,
        });
        if (sceneErr) throw new Error(`写入场景失败 (${scene.title}): ${sceneErr.message}`);
        sceneCount++;
      }
    }

    // 3. 写入 clues（relatedCharacterNames 解析为 relatedCharacterIds）
    let clueCount = 0;
    for (let i = 0; i < generatedJson.clues.length; i++) {
      const clue = generatedJson.clues[i];
      const relatedIds = clue.relatedCharacterNames
        .map((n) => nameToId.get(n))
        .filter((id): id is string => Boolean(id));
      const { error } = await supabase.from('clues').insert({
        id: crypto.randomUUID(),
        script_id: scriptId,
        title: clue.title,
        content: clue.content,
        clue_type: clue.clueType,
        search_round: clue.searchRound,
        location: clue.location,
        related_character_ids: relatedIds,
        is_distractor: clue.isDistractor,
        is_key_clue: clue.isKeyClue,
        unlock_condition: clue.unlockCondition,
        sort_order: i,
      });
      if (error) throw new Error(`写入线索失败 (${clue.title}): ${error.message}`);
      clueCount++;
    }

    // 4. 写入 character_relations（基于 truth 中可推断的凶手关系）
    let relationCount = 0;
    const relations = this.extractRelations(generatedJson, nameToId);
    for (const rel of relations) {
      const { error } = await supabase.from('character_relations').insert({
        id: crypto.randomUUID(),
        script_id: scriptId,
        source_character_id: rel.sourceId,
        target_character_id: rel.targetId,
        relation_type: rel.relationType,
        label: rel.label,
        is_visible: rel.isVisible,
        is_hidden_relation: rel.isHidden,
        hidden_label: rel.hiddenLabel,
      });
      if (error) throw new Error(`写入人物关系失败: ${error.message}`);
      relationCount++;
    }

    return {
      characters: characterCount,
      acts: actCount,
      scenes: sceneCount,
      clues: clueCount,
      relations: relationCount,
    };
  }

  /**
   * 校验生成结果格式：顶层字段存在性 + 数组类型 + truth 必要字段。
   */
  validateGeneratedJson(json: unknown): ValidationResult {
    const errors: string[] = [];
    if (!json || typeof json !== 'object') {
      return { valid: false, errors: ['生成结果不是合法对象'] };
    }
    const obj = json as Record<string, unknown>;

    if (!Array.isArray(obj.characters)) errors.push('characters 必须为数组');
    if (!Array.isArray(obj.acts)) errors.push('acts 必须为数组');
    if (!Array.isArray(obj.clues)) errors.push('clues 必须为数组');
    if (!obj.truth || typeof obj.truth !== 'object') {
      errors.push('truth 必须为对象');
    } else {
      const truth = obj.truth as Record<string, unknown>;
      if (typeof truth.summary !== 'string') errors.push('truth.summary 必须为字符串');
      if (typeof truth.murdererMethod !== 'string') errors.push('truth.murdererMethod 必须为字符串');
      if (typeof truth.motive !== 'string') errors.push('truth.motive 必须为字符串');
    }

    if (Array.isArray(obj.characters)) {
      for (let i = 0; i < obj.characters.length; i++) {
        const c = obj.characters[i] as Record<string, unknown>;
        if (!c || typeof c.name !== 'string') {
          errors.push(`characters[${i}].name 必须为字符串`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /** 提取人物列表（透传） */
  extractCharacters(json: GeneratedScriptJson): GeneratedScriptJson['characters'] {
    return json.characters ?? [];
  }

  /** 提取幕次与场景（透传） */
  extractActs(json: GeneratedScriptJson): GeneratedScriptJson['acts'] {
    return json.acts ?? [];
  }

  /** 提取线索（透传） */
  extractClues(json: GeneratedScriptJson): GeneratedScriptJson['clues'] {
    return json.clues ?? [];
  }

  /** 提取真相复盘（透传） */
  extractTruth(json: GeneratedScriptJson): GeneratedScriptJson['truth'] {
    return json.truth ?? {
      summary: '',
      murdererMethod: '',
      motive: '',
      timeline: '',
      foreshadowing: [],
    };
  }

  /**
   * 从生成结果推断人物关系：凶手 ↔ 各角色的"敌对/共谋"隐藏关系。
   * 此处为基础推断，后续可由独立的关系抽取 prompt 增强。
   */
  private extractRelations(
    json: GeneratedScriptJson,
    nameToId: Map<string, string>,
  ): Array<{
    sourceId: string;
    targetId: string;
    relationType: 'family' | 'friend' | 'lover' | 'enemy' | 'colleague' | 'conspiracy' | 'other';
    label: string;
    isVisible: boolean;
    isHidden: boolean;
    hiddenLabel: string;
  }> {
    const relations: Array<{
      sourceId: string;
      targetId: string;
      relationType: 'family' | 'friend' | 'lover' | 'enemy' | 'colleague' | 'conspiracy' | 'other';
      label: string;
      isVisible: boolean;
      isHidden: boolean;
      hiddenLabel: string;
    }> = [];

    const murderers = json.characters.filter((c) => c.isMurderer);
    for (const murderer of murderers) {
      const sourceId = nameToId.get(murderer.name);
      if (!sourceId) continue;
      for (const target of json.characters) {
        if (target.name === murderer.name) continue;
        const targetId = nameToId.get(target.name);
        if (!targetId) continue;
        relations.push({
          sourceId,
          targetId,
          relationType: 'enemy',
          label: '嫌疑人关系',
          isVisible: false,
          isHidden: true,
          hiddenLabel: '凶手与受害者的真实关系',
        });
      }
    }
    return relations;
  }
}
