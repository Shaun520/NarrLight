/**
 * 鍒嗛樁娈靛墽鏈敓鎴愬鎴风缂栨帓鍣? *
 * 鏇挎崲 generate/page.tsx 鐨?Mock setInterval锛岀湡瀹炶皟搴?7 涓樁娈?Edge Function锛? *   闃舵 0 STORY_BIBLE 鈫?纭闂搁棬 鈫?闃舵 1锛? 骞惰锛夆啋 闃舵 2锛圢 涓垎鎵瑰苟琛岋級鈫?闃舵 3锛? 骞惰锛? *
 * 鍏抽敭鑳藉姏锛? * - 闃舵鐘舵€佹満锛歱ending 鈫?running 鈫?completed / failed锛屾敮鎸佸崟闃舵閲嶈瘯
 * - 骞跺彂鎺у埗锛氶樁娈?2 鍒嗘壒 Promise.all锛堟瘡鎵?4 涓級
 * - 纭闂搁棬锛氶樁娈?0 瀹屾垚鍚庢殏鍋滐紝绛夊緟鐢ㄦ埛纭璁惧畾鏈? * - 涓柇鍙栨秷锛欰bortController 缁堟褰撳墠 SSE 娴? * - 杩涘害鍥炶皟锛氭瘡闃舵 chunk/progress/completed/error 浜嬩欢閫忎紶缁?UI
 * - 缁紶鎭㈠锛歳esumeFromScript(scriptId) 妫€娴?7 琛ㄥ畬鎴愮姸鎬佸苟鎭㈠鍒板搴旈樁娈? */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createSSEClient } from '@/lib/ai/stream/sse-handler';
import type { ScriptGenerationParams } from '@/lib/ai/prompts/script-generation';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';
import { createDefaultNickname, isDefaultNicknameConflict } from '@/lib/users/default-nickname';

// ===== 绫诲瀷瀹氫箟 =====

/** 闃舵鏍囪瘑 */
export type PhaseId =
  | 'story_bible'
  | 'character_profiles'
  | 'act_structure'
  | 'character_script'
  | 'clues'
  | 'organizer_manual'
  | 'truth_review'
  | 'timeline_structure';

/** 鍗曢樁娈电姸鎬?*/
export type PhaseStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** 闃舵 2 瑙掕壊鍓ф湰瀛愰」 */
export interface PhaseSubItem {
  id: string;
  label: string;
  status: PhaseStatus;
  error?: string;
}

interface CharacterScriptGenerationSpec {
  characterScriptMode?: 'single' | 'per_act' | 'custom';
  scriptsPerPlayer?: number;
  actCount?: number;
}

interface CharacterScriptTask {
  id: string;
  characterId: string;
  label: string;
  scriptPartIndex: number;
  scriptPartLabel: string;
  actOrder?: number;
}

/** 鍗曢樁娈佃繍琛屾椂淇℃伅 */
export interface PhaseState {
  id: PhaseId;
  status: PhaseStatus;
  /** 娴佸紡绱Н鐨勬枃鏈唴瀹癸紙鐢ㄤ簬 UI 棰勮锛?*/
  streamedText: string;
  /** 杩涘害鐧惧垎姣?0-100 */
  percent: number;
  /** 閿欒淇℃伅锛坰tatus=failed 鏃讹級 */
  error?: string;
  /** 闃舵浜у嚭锛坈ompleted 鏃剁殑 result_data锛屽 characterCount/wordCount 绛夛級 */
  result?: Record<string, unknown>;
  /** 闃舵 2 涓撴湁锛氬悇瑙掕壊瀛愮姸鎬?*/
  subItems?: PhaseSubItem[];
  /** 鑰楁椂锛堢锛?*/
  durationSeconds?: number;
  mode?: 'mock' | 'real';
  provider?: string;
  model?: string;
}

/** 缂栨帓鍣ㄦ暣浣撶姸鎬?*/
export interface PhasedGenerationState {
  /** 鍏宠仈鐨?scriptId锛堥樁娈?0 鍓嶅垱寤虹┖ script 琛岃幏寰楋級 */
  scriptId: string | null;
  /** 鍚勯樁娈电姸鎬?*/
  phases: Record<PhaseId, PhaseState>;
  /** 缂栨帓鍣ㄩ《灞傜姸鎬侊細idle / running / paused_at_gate / completed / failed */
  orchestrationStatus: 'idle' | 'running' | 'paused_at_gate' | 'completed' | 'failed';
  /** 褰撳墠杩愯闃舵 */
  currentPhase: PhaseId | null;
  /** 闃舵 0 浜у嚭鐨勮瀹氭湰锛堢敤浜庣‘璁ら椄闂?UI锛?*/
  storyBible: StoryBibleJson | null;
  /** 鍏ㄥ眬閿欒 */
  globalError?: string;
}

/** SSE 浜嬩欢缁熶竴缁撴瀯 */

/** Hook 杩斿洖鎺ュ彛 */
export interface UsePhasedGenerationResult {
  state: PhasedGenerationState;
  /** 鍚姩鍏ㄦ祦绋嬶細鍒涘缓绌?script 琛?鈫?闃舵 0 */
  start: (params: ScriptGenerationParams) => Promise<void>;
  /** 璁惧畾鏈‘璁ら椄闂細鐢ㄦ埛纭鍚庣户缁樁娈?1-3 */
  confirmStoryBible: () => Promise<void>;
  /** 璁惧畾鏈椄闂細閲嶆柊鐢熸垚闃舵 0 */
  regenerateStoryBible: () => Promise<void>;
  /** 閲嶈瘯鍗曚釜澶辫触闃舵 */
  retryPhase: (phaseId: PhaseId) => Promise<void>;
  /** 涓柇褰撳墠鐢熸垚 */
  abort: () => void;
  /** 閲嶇疆鍏ㄩ儴鐘舵€?*/
  reset: () => void;
  /** 浠庡凡鏈?scriptId 鎭㈠锛氭娴?7 琛ㄥ畬鎴愮姸鎬侊紝鍥炲～宸插畬鎴愰樁娈典笌璁惧畾鏈?*/
  resumeFromScript: (scriptId: string, params?: ScriptGenerationParams) => Promise<void>;
}

// ===== 闃舵瀹氫箟甯搁噺 =====

/** 闃舵椤哄簭锛堥櫎 character_script 澶栧潎涓哄崟瀹炰緥锛?*/
const PHASE_ORDER: PhaseId[] = [
  'story_bible',
  'character_profiles',
  'act_structure',
  'character_script',
  'clues',
  'organizer_manual',
  'truth_review',
  'timeline_structure',
];

/** 闃舵涓枃鏍囩 */
const PHASE_LABELS: Record<PhaseId, string> = {
  story_bible: '设定本',
  character_profiles: '人物设定',
  act_structure: '分幕结构',
  character_script: '角色剧本',
  clues: '线索卡',
  organizer_manual: '组织者手册',
  truth_review: '真相复盘',
  timeline_structure: '时间线结构化',
};

/** 闃舵 2 瑙掕壊鍓ф湰鐨勫苟鍙戜笂闄?*/
const CHARACTER_SCRIPT_CONCURRENCY = 4;

function getCharacterScriptSpec(result: PhaseState['result']): CharacterScriptGenerationSpec {
  const spec = result?.generationSpec as CharacterScriptGenerationSpec | undefined;
  return spec ?? {};
}

function buildCharacterScriptTasks(
  characters: Array<{ id: string; name: string }>,
  spec: CharacterScriptGenerationSpec,
): CharacterScriptTask[] {
  const scriptsPerPlayer = Math.max(1, Math.round(spec.scriptsPerPlayer ?? 1));
  const mode = spec.characterScriptMode ?? 'single';

  return characters.flatMap((character) =>
    Array.from({ length: scriptsPerPlayer }, (_, index) => {
      const partIndex = index + 1;
      const isPerAct = mode === 'per_act';
      const scriptPartLabel = isPerAct ? `第${partIndex}幕玩家剧本` : scriptsPerPlayer === 1 ? '完整玩家剧本' : `第${partIndex}本玩家剧本`;
      return {
        id: `${character.id}:part:${partIndex}`,
        characterId: character.id,
        label: scriptsPerPlayer === 1 ? character.name : `${character.name} · ${scriptPartLabel}`,
        scriptPartIndex: partIndex,
        scriptPartLabel,
        actOrder: isPerAct ? partIndex : undefined,
      };
    }),
  );
}

// ===== 鍒濆鐘舵€佸伐鍘?=====

function createInitialPhases(): Record<PhaseId, PhaseState> {
  const phases = {} as Record<PhaseId, PhaseState>;
  for (const id of PHASE_ORDER) {
    phases[id] = {
      id,
      status: 'pending',
      streamedText: '',
      percent: 0,
    };
  }
  return phases;
}

function createInitialState(): PhasedGenerationState {
  return {
    scriptId: null,
    phases: createInitialPhases(),
    orchestrationStatus: 'idle',
    currentPhase: null,
    storyBible: null,
  };
}

// ===== 涓嶅彲鍙樻洿鏂板伐鍏峰嚱鏁?=====

/** 鏇存柊鍗曚釜闃舵鐘舵€?*/
function updatePhase(
  state: PhasedGenerationState,
  phaseId: PhaseId,
  patch: Partial<PhaseState>,
): PhasedGenerationState {
  return {
    ...state,
    phases: {
      ...state.phases,
      [phaseId]: {
        ...state.phases[phaseId],
        ...patch,
      },
    },
  };
}

/** 鏇存柊闃舵 2 鐨勫崟涓鑹插瓙椤圭姸鎬?*/
function updateSubItem(
  state: PhasedGenerationState,
  phaseId: PhaseId,
  subItemId: string,
  patch: Partial<PhaseSubItem>,
): PhasedGenerationState {
  const phase = state.phases[phaseId];
  if (!phase.subItems) return state;
  return {
    ...state,
    phases: {
      ...state.phases,
      [phaseId]: {
        ...phase,
        subItems: phase.subItems.map((item) =>
          item.id === subItemId ? { ...item, ...patch } : item,
        ),
      },
    },
  };
}

/** 鏍规嵁 data 瀛楁鎺ㄦ柇 SSE 浜嬩欢绫诲瀷锛堝綋 event 瀛楁缂哄け鏃讹級 */
function inferSSEEventType(parsed: Record<string, unknown>): string | undefined {
  if ('chunk' in parsed || 'text' in parsed || 'content' in parsed) return 'chunk';
  if ('percent' in parsed) return 'progress';
  if ('result' in parsed || 'storyBible' in parsed) return 'completed';
  if ('error' in parsed || 'message' in parsed) return 'error';
  return undefined;
}

function estimateStreamingPercent(currentPercent: number, streamedLength: number): number {
  if (currentPercent >= 95) return currentPercent;
  const byLength = Math.min(90, Math.floor(streamedLength / 120));
  return Math.max(currentPercent, 5, byLength);
}

// ===== Hook 瀹炵幇 =====

export function usePhasedGeneration(): UsePhasedGenerationResult {
  const [state, setState] = useState<PhasedGenerationState>(createInitialState);

  // refs：保存最新值，避免闭包陷阱
  const abortControllerRef = useRef<AbortController | null>(null);
  const paramsRef = useRef<ScriptGenerationParams | null>(null);
  const scriptIdRef = useRef<string | null>(null);
  const stateRef = useRef<PhasedGenerationState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ===== handleSSEEvent锛氭牴鎹?SSE 浜嬩欢鐨?event 瀛楁鍒嗗彂鐘舵€佹洿鏂?=====
  const handleSSEEvent = useCallback(
    (
      phaseId: PhaseId,
      parsed: Record<string, unknown>,
      startTime: number,
    ): void => {
      const eventType = (parsed.event as string | undefined) ?? inferSSEEventType(parsed);
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);

      switch (eventType) {
        case 'start':
          setState((prev) =>
            updatePhase(prev, phaseId, {
              mode: parsed.mode === 'real' || parsed.mode === 'mock' ? parsed.mode : undefined,
              provider: typeof parsed.provider === 'string' ? parsed.provider : undefined,
              model: typeof parsed.model === 'string' ? parsed.model : undefined,
            }),
          );
          break;

        case 'chunk': {
          const chunk =
            (parsed.chunk as string) ||
            (parsed.text as string) ||
            (parsed.content as string) ||
            '';
          if (chunk) {
            setState((prev) => {
              const phase = prev.phases[phaseId];
              const streamedText = phase.streamedText + chunk;
              return updatePhase(prev, phaseId, {
                streamedText,
                percent: estimateStreamingPercent(phase.percent, streamedText.length),
              });
            });
          }
          break;
        }

        case 'progress': {
          const percent = typeof parsed.percent === 'number' ? parsed.percent : 0;
          const chunk = (parsed.chunk as string) || (parsed.text as string);
          setState((prev) =>
            updatePhase(prev, phaseId, {
              percent,
              ...(chunk
                ? { streamedText: prev.phases[phaseId].streamedText + chunk }
                : {}),
            }),
          );
          break;
        }

        case 'completed': {
          const result =
            (parsed.result as Record<string, unknown> | undefined) ?? parsed;

          if (phaseId === 'story_bible') {
            // 闃舵 0 瀹屾垚锛氬瓨鍌ㄨ瀹氭湰锛屾殏鍋滃湪纭闂搁棬
            const storyBible =
              (result.storyBible as StoryBibleJson | undefined) ??
              (result as unknown as StoryBibleJson);
            setState((prev) => ({
              ...updatePhase(prev, phaseId, {
                status: 'completed',
                percent: 100,
                result,
                durationSeconds,
              }),
              storyBible,
              orchestrationStatus: 'paused_at_gate',
              currentPhase: null,
            }));
          } else {
            setState((prev) =>
              updatePhase(prev, phaseId, {
                status: 'completed',
                percent: 100,
                result,
                durationSeconds,
              }),
            );
          }
          break;
        }

        case 'error': {
          const errorMsg =
            (parsed.error as string) || (parsed.message as string) || '闃舵澶辫触';
          setState((prev) =>
            updatePhase(prev, phaseId, {
              status: 'failed',
              error: errorMsg,
              durationSeconds,
            }),
          );
          break;
        }

        default:
          // 鏈煡浜嬩欢锛屽拷鐣?          break;
      }
    },
    [],
  );

  // ===== runPhase锛氭牳蹇?SSE 璋冪敤锛堝崟瀹炰緥闃舵锛?=====
  const runPhase = useCallback(
    async (
      phaseId: PhaseId,
      params: ScriptGenerationParams,
      options?: { characterId?: string },
    ): Promise<void> => {
      // 鏇存柊闃舵鐘舵€佷负 running
      setState((prev) =>
        updatePhase(prev, phaseId, {
          status: 'running',
          error: undefined,
          streamedText: '',
          percent: 0,
        }),
      );

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('未登录');

      const scriptId = scriptIdRef.current;
      if (!scriptId) throw new Error('scriptId 未设置');

      const url = `/api/generate/${phaseId.replace(/_/g, '-')}`;
      const storyBible = phaseId !== 'story_bible' ? state.storyBible : undefined;
      const latestState = stateRef.current;
      const phaseContext =
        phaseId !== 'story_bible'
          ? {
              storyBible: latestState.storyBible,
              characterProfiles: latestState.phases.character_profiles.result,
              actStructure: latestState.phases.act_structure.result,
              clues: latestState.phases.clues.result,
            }
          : {};
      const body = options?.characterId
        ? { scriptId, characterId: options.characterId, params, storyBible, ...phaseContext }
        : { scriptId, params, storyBible, ...phaseContext };

      // 鍒涘缓 AbortController 骞跺瓨鍌ㄥ埌 ref
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const startTime = Date.now();

      return new Promise<void>((resolve, reject) => {
        let phaseSucceeded = false;
        let phaseFailed = false;
        let failureError: Error | null = null;

        createSSEClient({
          url,
          method: 'POST',
          body,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          signal: controller.signal,
          onMessage: (data) => {
            try {
              const parsed = JSON.parse(data) as Record<string, unknown>;
              handleSSEEvent(phaseId, parsed, startTime);
              const eventType =
                (parsed.event as string | undefined) ?? inferSSEEventType(parsed);
              if (eventType === 'completed') {
                phaseSucceeded = true;
              } else if (eventType === 'error') {
                phaseFailed = true;
                failureError = new Error(
                  (parsed.error as string) ||
                    (parsed.message as string) ||
                    '闃舵澶辫触',
                );
              }
            } catch {
              // 闈?JSON锛屾寜 chunk 鏂囨湰澶勭悊
              setState((prev) =>
                updatePhase(prev, phaseId, {
                  streamedText: prev.phases[phaseId].streamedText + data,
                  percent: estimateStreamingPercent(
                    prev.phases[phaseId].percent,
                    prev.phases[phaseId].streamedText.length + data.length,
                  ),
                }),
              );
            }
          },
          onError: (err) => {
            if (!phaseFailed) {
              phaseFailed = true;
              failureError = err;
              setState((prev) =>
                updatePhase(prev, phaseId, {
                  status: 'failed',
                  error: err.message,
                  durationSeconds: Math.round((Date.now() - startTime) / 1000),
                }),
              );
            }
          },
          onClose: () => {
            if (controller.signal.aborted) {
              // 鐢ㄦ埛涓诲姩涓柇
              setState((prev) =>
                updatePhase(prev, phaseId, {
                  status: 'failed',
                  error: '鐢ㄦ埛涓柇',
                  durationSeconds: Math.round((Date.now() - startTime) / 1000),
                }),
              );
              reject(new Error('鐢ㄦ埛涓柇'));
            } else if (phaseFailed && failureError) {
              reject(failureError);
            } else if (phaseSucceeded) {
              resolve();
            } else {
              // 娴佸叧闂絾鏈敹鍒?completed 浜嬩欢
              setState((prev) =>
                updatePhase(prev, phaseId, {
                  status: 'failed',
                  error: '流意外关闭，未收到完成事件',
                  durationSeconds: Math.round((Date.now() - startTime) / 1000),
                }),
              );
              reject(new Error('流意外关闭，未收到完成事件'));
            }
          },
        });
      });
    },
    [handleSSEEvent, state.storyBible],
  );

  // ===== runCharacterScriptSubTask锛氬崟涓鑹插墽鏈瓙浠诲姟 =====
  const runCharacterScriptSubTask = useCallback(
    async (
      task: CharacterScriptTask,
      params: ScriptGenerationParams,
    ): Promise<void> => {
      // 鏍囪瀛愰」涓?running
      setState((prev) =>
        updateSubItem(prev, 'character_script', task.id, {
          status: 'running',
          error: undefined,
        }),
      );

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('未登录');

      const scriptId = scriptIdRef.current;
      if (!scriptId) throw new Error('scriptId 未设置');

      const url = '/api/generate/character-script';
      const body = {
        scriptId,
        characterId: task.characterId,
        scriptPartIndex: task.scriptPartIndex,
        scriptPartLabel: task.scriptPartLabel,
        actOrder: task.actOrder,
        params,
        storyBible: stateRef.current.storyBible,
        characterProfiles: stateRef.current.phases.character_profiles.result,
        actStructure: stateRef.current.phases.act_structure.result,
      };

      const controller = new AbortController();
      abortControllerRef.current = controller;

      return new Promise<void>((resolve) => {
        let subTaskCompleted = false;
        let subTaskFailed = false;

        createSSEClient({
          url,
          method: 'POST',
          body,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          signal: controller.signal,
          onMessage: (data) => {
            try {
              const parsed = JSON.parse(data) as Record<string, unknown>;
              const eventType =
                (parsed.event as string | undefined) ?? inferSSEEventType(parsed);

              if (eventType === 'completed') {
                subTaskCompleted = true;
                setState((prev) =>
                  updateSubItem(prev, 'character_script', task.id, {
                    status: 'completed',
                  }),
                );
              } else if (eventType === 'error') {
                subTaskFailed = true;
                const errorMsg =
                  (parsed.error as string) ||
                  (parsed.message as string) ||
                  '瑙掕壊鍓ф湰鐢熸垚澶辫触';
                setState((prev) =>
                  updateSubItem(prev, 'character_script', task.id, {
                    status: 'failed',
                    error: errorMsg,
                  }),
                );
              } else if (eventType === 'chunk') {
                // 将 chunk 追加到父阶段的 streamedText，供 UI 预览
                const chunk =
                  (parsed.chunk as string) ||
                  (parsed.text as string) ||
                  (parsed.content as string) ||
                  '';
                if (chunk) {
                  setState((prev) => {
                    const phase = prev.phases.character_script;
                    const streamedText = phase.streamedText + chunk;
                    return updatePhase(prev, 'character_script', {
                      streamedText,
                      percent: estimateStreamingPercent(phase.percent, streamedText.length),
                    });
                  });
                }
              }
            } catch {
              // 闈?JSON锛屽拷鐣ュ瓙浠诲姟绾у埆鐨勭函鏂囨湰
            }
          },
          onError: (err) => {
            subTaskFailed = true;
            setState((prev) =>
              updateSubItem(prev, 'character_script', task.id, {
                status: 'failed',
                error: err.message,
              }),
            );
          },
          onClose: () => {
            if (controller.signal.aborted) {
              setState((prev) =>
                updateSubItem(prev, 'character_script', task.id, {
                  status: 'failed',
                  error: '鐢ㄦ埛涓柇',
                }),
              );
            } else if (!subTaskCompleted && !subTaskFailed) {
              // 娴佸叧闂絾鏈敹鍒?completed/error 浜嬩欢
              setState((prev) =>
                updateSubItem(prev, 'character_script', task.id, {
                  status: 'failed',
                  error: '流意外关闭',
                }),
              );
            }
            // 子任务始终 resolve，不阻断同批次其他角色
            resolve();
          },
        });
      });
    },
    [],
  );

  // ===== runPhaseBatch锛氶樁娈?2 瑙掕壊鍓ф湰鎵规璋冨害 =====
  const runPhaseBatch = useCallback(
    async (
      tasks: CharacterScriptTask[],
      params: ScriptGenerationParams,
    ): Promise<void> => {
      // 鍒濆鍖?/ 澶嶇敤 subItems
      setState((prev) => {
        const phase = prev.phases.character_script;
        if (phase.subItems && phase.subItems.length === tasks.length) {
          return updatePhase(prev, 'character_script', { status: 'running' });
        }
        return updatePhase(prev, 'character_script', {
          status: 'running',
          subItems: tasks.map((task) => ({
            id: task.id,
            label: task.label,
            status: 'pending' as const,
          })),
        });
      });

      // 分批处理，每批 CHARACTER_SCRIPT_CONCURRENCY 个
      for (let i = 0; i < tasks.length; i += CHARACTER_SCRIPT_CONCURRENCY) {
        const batch = tasks.slice(i, i + CHARACTER_SCRIPT_CONCURRENCY);
        await Promise.all(
          batch.map((task) => runCharacterScriptSubTask(task, params)),
        );
      }

      // 鍏ㄩ儴瀹屾垚鍚庢爣璁伴樁娈靛畬鎴?/ 澶辫触
      setState((prev) => {
        const allCompleted = prev.phases.character_script.subItems?.every(
          (s) => s.status === 'completed',
        );
        return updatePhase(prev, 'character_script', {
          status: allCompleted ? 'completed' : 'failed',
          percent: 100,
        });
      });
    },
    [runCharacterScriptSubTask],
  );

  // ===== start锛氬惎鍔ㄥ叏娴佺▼ =====
  const start = useCallback(
    async (params: ScriptGenerationParams): Promise<void> => {
      paramsRef.current = params;

      try {
        // 创建空 script 行
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error('鏈櫥褰曪紝璇峰厛鐧诲綍鍚庡啀鐢熸垚鍓ф湰');

        // 验证当前会话用户真实存在
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          throw new Error('鐧诲綍浼氳瘽鏃犳晥锛岃閲嶆柊鐧诲綍鍚庡啀鐢熸垚鍓ф湰');
        }

        // 纭繚 public.users 涓瓨鍦ㄥ綋鍓嶇敤鎴疯褰曪紝鍥犱负 scripts.author_id
        console.log('[generate] auth user:', { id: user.id, email: user.email });
        if (user.email) {
          const { data: existingUser } = await supabase
            .from('users')
            .select('id,is_banned')
            .eq('id', user.id)
            .maybeSingle();

          if (existingUser?.is_banned) {
            await supabase.auth.signOut();
            throw new Error('账号已被封禁，请联系管理员');
          }

          let upsertError: { code?: string; message?: string } | null = null;
          if (!existingUser) {
            for (let attempt = 0; attempt < 8; attempt += 1) {
              const nickname =
                typeof user.user_metadata?.nickname === 'string' && user.user_metadata.nickname.trim()
                  ? user.user_metadata.nickname.trim()
                  : await createDefaultNickname(supabase);
              const { error } = await supabase.from('users').insert({
                id: user.id,
                email: user.email,
                nickname,
              });

              if (!error) {
                await supabase.auth.updateUser({ data: { nickname } });
                upsertError = null;
                break;
              }

              upsertError = error;
              if (!isDefaultNicknameConflict(error)) {
                break;
              }
            }
          }
          console.log('[generate] upsert public.users result:', { upsertError });
          if (upsertError) {
            console.error('鍚屾 public.users 澶辫触:', upsertError);
            throw new Error(`鍚屾鐢ㄦ埛璁板綍澶辫触: ${upsertError.message}`);
          }
        } else {
          throw new Error('当前登录用户没有邮箱信息，无法同步用户记录');
        }

        const { data: scriptRow, error } = await supabase
          .from('scripts')
          .insert({
            id: crypto.randomUUID(),
            author_id: user.id,
            title: params.title,
            genre: params.genre,
            player_count: params.players,
            duration_hours: params.duration,
            difficulty: params.difficulty,
            background_setting: params.background,
            core_theme: params.theme,
            status: 'generating',
            word_count: 0,
          })
          .select('id')
          .single();

        if (error) {
          const msg = error.message ?? '';
          const code = (error as { code?: string }).code ?? '';
          if (msg.includes('violates check constraint') ||
              msg.includes('scripts_genre_check') ||
              msg.includes('scripts_difficulty_check')) {
            throw new Error('表单参数值不合法，请检查题材和难度选项后重试');
          }
          if (msg.includes('violates foreign key constraint') ||
              msg.includes('scripts_author_id_fkey') ||
              code === '23503') {
            throw new Error(
              `当前登录账号在应用用户表中不存在，请重新登录或联系管理员（原始错误：${msg}）`
            );
          }
          throw new Error(`创建剧本失败: ${msg} (code: ${code})`);
        }
        if (!scriptRow) {
          throw new Error('鍒涘缓鍓ф湰澶辫触: 鏈煡閿欒');
        }

        scriptIdRef.current = scriptRow.id;
        setState((prev) => ({
          ...prev,
          scriptId: scriptRow.id,
          orchestrationStatus: 'running',
          currentPhase: 'story_bible',
        }));

        // 闃舵 0
        await runPhase('story_bible', params);
        // phase 0 完成后 orchestrationStatus='paused_at_gate'
      } catch (err) {
        setState((prev) => ({
          ...prev,
          orchestrationStatus: 'failed',
          globalError: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [runPhase],
  );

  // ===== confirmStoryBible锛氱‘璁ら椄闂?鈫?闃舵 1-3 =====
  const confirmStoryBible = useCallback(
    async (): Promise<void> => {
      if (state.orchestrationStatus !== 'paused_at_gate' || !state.storyBible) return;

      const params = paramsRef.current;
      if (!params) return;

      const scriptId = scriptIdRef.current;
      if (!scriptId) return;

      setState((prev) => ({
        ...prev,
        orchestrationStatus: 'running',
        currentPhase: 'character_profiles',
      }));

      try {
        // 闃舵 1锛氫汉鐗╄瀹?+ 鍒嗗箷缁撴瀯 骞惰
        await Promise.all([
          runPhase('character_profiles', params),
          runPhase('act_structure', params),
        ]);

        // 璇诲彇 characters 琛ㄨ幏鍙栬鑹?ID 鍒楄〃
        const supabase = createClient();
        const { data: characters, error: charError } = await supabase
          .from('characters')
          .select('id, name')
          .eq('script_id', scriptId)
          .order('sort_order');

        let characterList = (characters ?? []) as Array<{ id: string; name: string }>;
        if (charError || characterList.length === 0) {
          const profileResult = state.phases.character_profiles.result as
            | { characters?: Array<{ name: string }> }
            | undefined;
          const generatedCharacters = profileResult?.characters ?? [];
          const fallbackCharacters = state.storyBible.characterSkeleton.nodes;
          const sourceCharacters =
            generatedCharacters.length > 0 ? generatedCharacters : fallbackCharacters;

          characterList = sourceCharacters.map((character, index) => ({
              id: `mock-character-${index + 1}`,
              name: character.name,
            }));
        }

        if (characterList.length === 0) {
          throw new Error('阶段 1a 未产出角色');
        }

        const characterScriptTasks = buildCharacterScriptTasks(
          characterList,
          getCharacterScriptSpec(stateRef.current.phases.act_structure.result),
        );

        // 阶段 2：按角色剧本份数分批并行
        setState((prev) =>
          updatePhase(prev, 'character_script', {
            subItems: characterScriptTasks.map((task) => ({
              id: task.id,
              label: task.label,
              status: 'pending' as const,
            })),
          }),
        );

        setState((prev) => ({ ...prev, currentPhase: 'character_script' }));
        await runPhaseBatch(characterScriptTasks, params);

        // 闃舵 3锛氱嚎绱㈠崱 + 缁勭粐鑰呮墜鍐?+ 鐪熺浉澶嶇洏 骞惰
        setState((prev) => ({ ...prev, currentPhase: 'clues' }));
        await Promise.all([
          runPhase('clues', params),
          runPhase('organizer_manual', params),
          runPhase('truth_review', params),
        ]);

        // 阶段 4：时间线结构化（依赖 truth_review 完成）
        setState((prev) => ({ ...prev, currentPhase: 'timeline_structure' }));
        await runPhase('timeline_structure', params);

        // 鍏ㄩ儴瀹屾垚
        setState((prev) => ({
          ...prev,
          orchestrationStatus: 'completed',
          currentPhase: null,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          orchestrationStatus: 'failed',
          globalError: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [
      runPhase,
      runPhaseBatch,
      state.orchestrationStatus,
      state.phases.character_profiles.result,
      state.storyBible,
    ],
  );

  // ===== regenerateStoryBible锛氶噸鏂扮敓鎴愰樁娈?0 =====
  const regenerateStoryBible = useCallback(
    async (): Promise<void> => {
      if (state.orchestrationStatus !== 'paused_at_gate') return;

      const params = paramsRef.current;
      if (!params) return;

      // 重置阶段 0 状态
      setState((prev) => ({
        ...updatePhase(prev, 'story_bible', {
          status: 'pending',
          error: undefined,
          streamedText: '',
          percent: 0,
        }),
        orchestrationStatus: 'running',
        currentPhase: 'story_bible',
        storyBible: null,
      }));

      try {
        await runPhase('story_bible', params);
      } catch (err) {
        setState((prev) => ({
          ...prev,
          orchestrationStatus: 'failed',
          globalError: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [runPhase, state.orchestrationStatus],
  );

  // ===== retryPhase锛氶噸璇曞崟涓け璐ラ樁娈?=====
  const retryPhase = useCallback(
    async (phaseId: PhaseId): Promise<void> => {
      const params = paramsRef.current;
      if (!params) return;

      // 閲嶇疆鎸囧畾闃舵鐘舵€佷负 pending
      setState((prev) =>
        updatePhase(prev, phaseId, {
          status: 'pending',
          error: undefined,
          streamedText: '',
          percent: 0,
        }),
      );

      try {
        if (phaseId === 'character_script') {
          // 瑙掕壊鍓ф湰闃舵闇€閲嶆柊璇诲彇 characters 琛ㄨ幏鍙?ID 鍒楄〃
          const scriptId = scriptIdRef.current;
          if (!scriptId) throw new Error('scriptId 未设置');

          const supabase = createClient();
          const { data: characters, error: charError } = await supabase
            .from('characters')
            .select('id, name')
            .eq('script_id', scriptId)
            .order('sort_order');

          if (charError || !characters || characters.length === 0) {
            throw new Error('未找到角色数据');
          }

          const characterList = characters as Array<{ id: string; name: string }>;
          const characterScriptTasks = buildCharacterScriptTasks(
            characterList,
            getCharacterScriptSpec(stateRef.current.phases.act_structure.result),
          );

          // 閲嶇疆 subItems
          setState((prev) =>
            updatePhase(prev, 'character_script', {
              subItems: characterScriptTasks.map((task) => ({
                id: task.id,
                label: task.label,
                status: 'pending' as const,
              })),
            }),
          );

          setState((prev) => ({
            ...prev,
            orchestrationStatus: 'running',
            currentPhase: 'character_script',
          }));

          await runPhaseBatch(characterScriptTasks, params);
        } else {
          setState((prev) => ({
            ...prev,
            orchestrationStatus: 'running',
            currentPhase: phaseId,
          }));
          await runPhase(phaseId, params);
        }
      } catch (err) {
        setState((prev) => ({
          ...prev,
          orchestrationStatus: 'failed',
          globalError: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [runPhase, runPhaseBatch],
  );

  // ===== abort锛氫腑鏂綋鍓嶇敓鎴?=====
  const abort = useCallback((): void => {
    abortControllerRef.current?.abort();
    setState((prev) => {
      if (!prev.currentPhase) return prev;
      return {
        ...updatePhase(prev, prev.currentPhase, {
          status: 'failed',
          error: '鐢ㄦ埛涓柇',
        }),
        orchestrationStatus: 'failed',
      };
    });
  }, []);

  // ===== reset锛氶噸缃叏閮ㄧ姸鎬?=====
  const reset = useCallback((): void => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    paramsRef.current = null;
    scriptIdRef.current = null;
    setState(createInitialState());
  }, []);

  // ===== resumeFromScript锛氫粠宸叉湁 scriptId 鎭㈠ =====
  // 妫€娴?7 寮犺〃鐨勫畬鎴愮姸鎬侊紝鍥炲～宸插畬鎴愰樁娈典笌璁惧畾鏈紝
  // 根据 storyBible.confirmed 决定停在 paused_at_gate 还是继续后续阶段
  const resumeFromScript = useCallback(
    async (scriptId: string, params?: ScriptGenerationParams): Promise<void> => {
      const supabase = createClient();

      // 并行查询 7 张表，判断各阶段完成状态
      const [
        storyBibleRes,
        charactersRes,
        actsRes,
        characterScriptsRes,
        cluesRes,
        organizerManualRes,
        truthReviewRes,
        timelineEventsRes,
      ] = await Promise.all([
        supabase
          .from('story_bibles')
          .select(
            'murderer_character_name, murder_method, core_trick, motive_chain, character_skeleton, timeline_outline, truth_summary, foreshadowing_plan, confirmed',
          )
          .eq('script_id', scriptId)
          .maybeSingle(),
        supabase
          .from('characters')
          .select('id, name, sort_order', { count: 'exact', head: false })
          .eq('script_id', scriptId)
          .order('sort_order'),
        supabase
          .from('acts')
          .select('id', { count: 'exact', head: true })
          .eq('script_id', scriptId),
        supabase
          .from('character_scripts')
          .select('id', { count: 'exact', head: true })
          .eq('script_id', scriptId),
        supabase
          .from('clues')
          .select('id', { count: 'exact', head: true })
          .eq('script_id', scriptId),
        supabase
          .from('organizer_manuals')
          .select('id')
          .eq('script_id', scriptId)
          .maybeSingle(),
        supabase
          .from('truth_reviews')
          .select('id')
          .eq('script_id', scriptId)
          .maybeSingle(),
        supabase
          .from('timeline_events')
          .select('id', { count: 'exact', head: true })
          .eq('script_id', scriptId),
      ]);

      const storyBibleRow = storyBibleRes.data as {
        murderer_character_name: string;
        murder_method: string;
        core_trick: string;
        motive_chain: string;
        character_skeleton: StoryBibleJson['characterSkeleton'];
        timeline_outline: string;
        truth_summary: string;
        foreshadowing_plan: StoryBibleJson['foreshadowingPlan'];
        confirmed: boolean;
      } | null;

      const storyBibleExists = !!storyBibleRow;
      const charactersList = (charactersRes.data ?? []) as Array<{
        id: string;
        name: string;
        sort_order: number;
      }>;
      const charactersExist = charactersList.length > 0;
      const actsExists = (actsRes.count ?? 0) > 0;
      const characterScriptsExists = (characterScriptsRes.count ?? 0) > 0;
      const cluesExists = (cluesRes.count ?? 0) > 0;
      const organizerManualExists = !!organizerManualRes.data;
      const truthReviewExists = !!truthReviewRes.data;
      const timelineEventsExists = (timelineEventsRes.count ?? 0) > 0;

      // 闃舵 0 鏈畬鎴愶細涓嶅彲鎭㈠锛屼繚鎸?idle
      if (!storyBibleExists) {
        return;
      }

      // 回填已完成阶段状态
      const phases = createInitialPhases();
      if (storyBibleExists) {
        phases.story_bible = {
          ...phases.story_bible,
          status: 'completed',
          percent: 100,
        };
      }
      if (charactersExist) {
        phases.character_profiles = {
          ...phases.character_profiles,
          status: 'completed',
          percent: 100,
        };
      }
      if (actsExists) {
        phases.act_structure = {
          ...phases.act_structure,
          status: 'completed',
          percent: 100,
        };
      }
      if (characterScriptsExists) {
        phases.character_script = {
          ...phases.character_script,
          status: 'completed',
          percent: 100,
          subItems: charactersList.map((c) => ({
            id: c.id,
            label: c.name,
            status: 'completed' as PhaseStatus,
          })),
        };
      }
      if (cluesExists) {
        phases.clues = {
          ...phases.clues,
          status: 'completed',
          percent: 100,
        };
      }
      if (organizerManualExists) {
        phases.organizer_manual = {
          ...phases.organizer_manual,
          status: 'completed',
          percent: 100,
        };
      }
      if (truthReviewExists) {
        phases.truth_review = {
          ...phases.truth_review,
          status: 'completed',
          percent: 100,
        };
      }
      if (timelineEventsExists) {
        phases.timeline_structure = {
          ...phases.timeline_structure,
          status: 'completed',
          percent: 100,
        };
      }

      // 回填设定本，用于闸门 UI
      const restoredStoryBible: StoryBibleJson | null = storyBibleRow
        ? {
            murdererName: storyBibleRow.murderer_character_name,
            murderMethod: storyBibleRow.murder_method,
            coreTrick: storyBibleRow.core_trick,
            motiveChain: storyBibleRow.motive_chain,
            characterSkeleton: storyBibleRow.character_skeleton,
            timelineOutline: storyBibleRow.timeline_outline,
            truthSummary: storyBibleRow.truth_summary,
            foreshadowingPlan: storyBibleRow.foreshadowing_plan,
          }
        : null;

      // 鍚屾 refs锛屼娇鍚庣画 retryPhase / confirmStoryBible 鍙敤
      scriptIdRef.current = scriptId;
      if (params) {
        paramsRef.current = params;
      }

      // 鍐冲畾鎭㈠鍒板摢涓姸鎬侊細
      // - 鍏ㄩ儴瀹屾垚 鈫?completed
      // - 阶段 0 完成但未确认 -> paused_at_gate
      // - 阶段 0 已确认但后续未全部完成 -> paused_at_gate
      const allCompleted =
        storyBibleExists &&
        charactersExist &&
        actsExists &&
        characterScriptsExists &&
        cluesExists &&
        organizerManualExists &&
        truthReviewExists &&
        timelineEventsExists;

      let orchestrationStatus: PhasedGenerationState['orchestrationStatus'];
      if (allCompleted) {
        orchestrationStatus = 'completed';
      } else {
        orchestrationStatus = 'paused_at_gate';
      }

      setState({
        scriptId,
        phases,
        orchestrationStatus,
        currentPhase: null,
        storyBible: restoredStoryBible,
      });
    },
    [],
  );

  return {
    state,
    start,
    confirmStoryBible,
    regenerateStoryBible,
    retryPhase,
    abort,
    reset,
    resumeFromScript,
  };
}

// 导出常量供外部使用
export { PHASE_LABELS, PHASE_ORDER };
