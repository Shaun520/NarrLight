/**
 * 閸掑棝妯佸▓闈涘⒔閺堫剛鏁撻幋鎰吂閹撮顏紓鏍ㄥ笓閸? *
 * 閺囨寧宕?generate/page.tsx 閻?Mock setInterval閿涘瞼婀＄€圭偠鐨熸惔?7 娑擃亪妯佸▓?Edge Function閿? *   闂冭埖顔?0 STORY_BIBLE 閳?绾喛顓婚梻鎼佹， 閳?闂冭埖顔?1閿? 楠炴儼顢戦敍澶嗗晪 闂冭埖顔?2閿涘湤 娑擃亜鍨庨幍鐟拌嫙鐞涘矉绱氶埆?闂冭埖顔?3閿? 楠炴儼顢戦敍? *
 * 閸忔娊鏁懗钘夊閿? * - 闂冭埖顔岄悩鑸碘偓浣规簚閿涙ending 閳?running 閳?completed / failed閿涘本鏁幐浣稿礋闂冭埖顔岄柌宥堢槸
 * - 楠炶泛褰傞幒褍鍩楅敍姘舵▉濞?2 閸掑棙澹?Promise.all閿涘牊鐦￠幍?4 娑擃亷绱?
 * - 绾喛顓婚梻鎼佹，閿涙岸妯佸▓?0 鐎瑰本鍨氶崥搴㈡畯閸嬫粣绱濈粵澶婄窡閻劍鍩涚涵顔款吇鐠佹儳鐣鹃張? * - 娑擃厽鏌囬崣鏍ㄧХ閿涙bortController 缂佸牊顒涜ぐ鎾冲 SSE 濞? * - 鏉╂稑瀹抽崶鐐剁殶閿涙碍鐦￠梼鑸殿唽 chunk/progress/completed/error 娴滃娆㈤柅蹇庣炊缂?UI
 * - 缂侇厺绱堕幁銏狀槻閿涙esumeFromScript(scriptId) 濡偓濞?7 鐞涖劌鐣幋鎰Ц閹礁鑻熼幁銏狀槻閸掓澘顕惔鏃堟▉濞? */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createSSEClient } from '@/lib/ai/stream/sse-handler';
import type { ScriptGenerationParams } from '@/lib/ai/prompts/script-generation';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';
import { createDefaultNickname, isDefaultNicknameConflict } from '@/lib/users/default-nickname';

// ===== 缁鐎风€规矮绠?=====

/** 闂冭埖顔岄弽鍥槕 */
export type PhaseId =
  | 'story_bible'
  | 'character_profiles'
  | 'act_structure'
  | 'character_script'
  | 'clues'
  | 'organizer_manual'
  | 'truth_review'
  | 'timeline_structure';

/** 閸楁洟妯佸▓鐢靛Ц閹?*/
export type PhaseStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** 闂冭埖顔?2 鐟欐帟澹婇崜褎婀扮€涙劙銆?*/
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

/** 閸楁洟妯佸▓浣冪箥鐞涘本妞傛穱鈩冧紖 */
export interface PhaseState {
  id: PhaseId;
  status: PhaseStatus;
  /** 濞翠礁绱＄槐顖溞濋惃鍕瀮閺堫剙鍞寸€圭櫢绱欓悽銊ょ艾 UI 妫板嫯顫嶉敍?*/
  streamedText: string;
  /** 鏉╂稑瀹抽惂鎯у瀻濮?0-100 */
  percent: number;
  /** 闁挎瑨顕ゆ穱鈩冧紖閿涘澃tatus=failed 閺冭绱?*/
  error?: string;
  /** 闂冭埖顔屾禍褍鍤敍鍧坥mpleted 閺冨墎娈?result_data閿涘苯顩?characterCount/wordCount 缁涘绱?*/
  result?: Record<string, unknown>;
  /** 闂冭埖顔?2 娑撴挻婀侀敍姘倗鐟欐帟澹婄€涙劗濮搁幀?*/
  subItems?: PhaseSubItem[];
  /** 閼版妞傞敍鍫㈩潡閿?*/
  durationSeconds?: number;
  mode?: 'mock' | 'real';
  provider?: string;
  model?: string;
}

/** 缂傛牗甯撻崳銊︽殻娴ｆ挾濮搁幀?*/
export interface PhasedGenerationState {
  /** 閸忓疇浠堥惃?scriptId閿涘牓妯佸▓?0 閸撳秴鍨卞铏光敄 script 鐞涘矁骞忓妤嬬礆 */
  scriptId: string | null;
  /** 閸氬嫰妯佸▓鐢靛Ц閹?*/
  phases: Record<PhaseId, PhaseState>;
  /** 缂傛牗甯撻崳銊┿€婄仦鍌滃Ц閹緤绱癷dle / running / paused_at_gate / completed / failed */
  orchestrationStatus: 'idle' | 'running' | 'paused_at_gate' | 'completed' | 'failed';
  /** 瑜版挸澧犳潻鎰攽闂冭埖顔?*/
  currentPhase: PhaseId | null;
  /** 闂冭埖顔?0 娴溠冨毉閻ㄥ嫯顔曠€规碍婀伴敍鍫㈡暏娴滃海鈥樼拋銈夋闂?UI閿?*/
  storyBible: StoryBibleJson | null;
  /** 閸忋劌鐪柨娆掝嚖 */
  globalError?: string;
}

/** SSE 娴滃娆㈢紒鐔剁缂佹挻鐎?*/

/** Hook 鏉╂柨娲栭幒銉ュ經 */
export interface UsePhasedGenerationResult {
  state: PhasedGenerationState;
  /** 閸氼垰濮╅崗銊︾ウ缁嬪绱伴崚娑樼紦缁?script 鐞?閳?闂冭埖顔?0 */
  start: (params: ScriptGenerationParams) => Promise<void>;
  /** 鐠佹儳鐣鹃張顒傗€樼拋銈夋闂傤煉绱伴悽銊﹀煕绾喛顓婚崥搴ｆ埛缂侇參妯佸▓?1-3 */
  confirmStoryBible: () => Promise<void>;
  /** 鐠佹儳鐣鹃張顒勬闂傤煉绱伴柌宥嗘煀閻㈢喐鍨氶梼鑸殿唽 0 */
  regenerateStoryBible: () => Promise<void>;
  /** 闁插秷鐦崡鏇氶嚋婢惰精瑙﹂梼鑸殿唽 */
  retryPhase: (phaseId: PhaseId) => Promise<void>;
  /** 娑擃厽鏌囪ぐ鎾冲閻㈢喐鍨?*/
  abort: () => void;
  /** 闁插秶鐤嗛崗銊╁劥閻樿埖鈧?*/
  reset: () => void;
  /** 娴犲骸鍑￠張?scriptId 閹垹顦查敍姘梾濞?7 鐞涖劌鐣幋鎰Ц閹緤绱濋崶鐐诧綖瀹告彃鐣幋鎰版▉濞堝吀绗岀拋鎯х暰閺?*/
  resumeFromScript: (scriptId: string, params?: ScriptGenerationParams) => Promise<void>;
}

// ===== 闂冭埖顔岀€规矮绠熺敮鎼佸櫤 =====

/** 闂冭埖顔屾い鍝勭碍閿涘牓娅?character_script 婢舵牕娼庢稉鍝勫礋鐎圭偘绶ラ敍?*/
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

/** 闂冭埖顔屾稉顓熸瀮閺嶅洨顒?*/
const PHASE_LABELS: Record<PhaseId, string> = {
  story_bible: '设定本',
  character_profiles: '人物设定',
  act_structure: '分幕结构',
  character_script: '玩家剧本',
  clues: '线索卡',
  organizer_manual: '组织者手册',
  truth_review: '真相复盘',
  timeline_structure: '时间线结构化',
};

/** 闂冭埖顔?2 鐟欐帟澹婇崜褎婀伴惃鍕嫙閸欐垳绗傞梽?*/
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
      const scriptPartLabel = isPerAct
        ? `第${partIndex}幕玩家剧本`
        : scriptsPerPlayer === 1
          ? '完整玩家剧本'
          : `第${partIndex}本玩家剧本`;
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

// ===== 閸掓繂顫愰悩鑸碘偓浣镐紣閸?=====

function getExpectedCharacterScriptCount(
  characterCount: number,
  spec: CharacterScriptGenerationSpec | undefined,
): number {
  const scriptsPerPlayer = Math.max(1, Math.round(spec?.scriptsPerPlayer ?? 1));
  return Math.max(1, characterCount) * scriptsPerPlayer;
}

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

// ===== 娑撳秴褰查崣妯绘纯閺傛澘浼愰崗宄板毐閺?=====

/** 閺囧瓨鏌婇崡鏇氶嚋闂冭埖顔岄悩鑸碘偓?*/
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

/** 閺囧瓨鏌婇梼鑸殿唽 2 閻ㄥ嫬宕熸稉顏囶潡閼规彃鐡欐い鍦Ц閹?*/
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

/** 閺嶈宓?data 鐎涙顔岄幒銊︽焽 SSE 娴滃娆㈢猾璇茬€烽敍鍫濈秼 event 鐎涙顔岀紓鍝勩亼閺冭绱?*/
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

// ===== Hook 鐎圭偟骞?=====

export function usePhasedGeneration(): UsePhasedGenerationResult {
  const [state, setState] = useState<PhasedGenerationState>(createInitialState);

  // refs锛氫繚瀛樻渶鏂板€硷紝閬垮厤闂寘闄烽槺
  const abortControllersRef = useRef<Set<AbortController>>(new Set());
  const paramsRef = useRef<ScriptGenerationParams | null>(null);
  const scriptIdRef = useRef<string | null>(null);
  const stateRef = useRef<PhasedGenerationState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const registerAbortController = useCallback((controller: AbortController): (() => void) => {
    abortControllersRef.current.add(controller);
    return () => {
      abortControllersRef.current.delete(controller);
    };
  }, []);

  const abortActiveRequests = useCallback((): void => {
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
  }, []);

  // ===== handleSSEEvent閿涙碍鐗撮幑?SSE 娴滃娆㈤惃?event 鐎涙顔岄崚鍡楀絺閻樿埖鈧焦娲块弬?=====
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
            // 闂冭埖顔?0 鐎瑰本鍨氶敍姘摠閸屻劏顔曠€规碍婀伴敍灞炬畯閸嬫粌婀涵顔款吇闂傛悂妫?
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
            (parsed.error as string) || (parsed.message as string) || '闂冭埖顔屾径杈Е';
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
          // 閺堫亞鐓℃禍瀣╂閿涘苯鎷烽悾?          break;
      }
    },
    [],
  );

  // ===== runPhase閿涙碍鐗宠箛?SSE 鐠嬪啰鏁ら敍鍫濆礋鐎圭偘绶ラ梼鑸殿唽閿?=====
  const runPhase = useCallback(
    async (
      phaseId: PhaseId,
      params: ScriptGenerationParams,
      options?: { characterId?: string },
    ): Promise<void> => {
      // 閺囧瓨鏌婇梼鑸殿唽閻樿埖鈧椒璐?running
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

      // 閸掓稑缂?AbortController 楠炶泛鐡ㄩ崒銊ュ煂 ref
      const controller = new AbortController();
      const unregisterAbortController = registerAbortController(controller);

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
                    '闂冭埖顔屾径杈Е',
                );
              }
            } catch {
              // 闂?JSON閿涘本瀵?chunk 閺傚洦婀版径鍕倞
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
            unregisterAbortController();
            if (controller.signal.aborted) {
              // 閻劍鍩涙稉璇插З娑擃厽鏌?
              setState((prev) =>
                updatePhase(prev, phaseId, {
                  status: 'failed',
                  error: '用户中断',
                  durationSeconds: Math.round((Date.now() - startTime) / 1000),
                }),
              );
              reject(new Error('用户中断'));
            } else if (phaseFailed && failureError) {
              reject(failureError);
            } else if (phaseSucceeded) {
              resolve();
            } else {
              // 濞翠礁鍙ч梻顓濈稻閺堫亝鏁归崚?completed 娴滃娆?
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
    [handleSSEEvent, registerAbortController, state.storyBible],
  );

  // ===== runCharacterScriptSubTask閿涙艾宕熸稉顏囶潡閼规彃澧介張顒€鐡欐禒璇插 =====
  const runCharacterScriptSubTask = useCallback(
    async (
      task: CharacterScriptTask,
      params: ScriptGenerationParams,
    ): Promise<boolean> => {
      // 閺嶅洩顔囩€涙劙銆嶆稉?running
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
      const unregisterAbortController = registerAbortController(controller);

      return new Promise<boolean>((resolve) => {
        let subTaskCompleted = false;
        let subTaskFailed = false;
        let settled = false;

        const finish = (success: boolean) => {
          if (settled) return;
          settled = true;
          unregisterAbortController();
          resolve(success);
        };

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
                  '玩家剧本生成失败';
                setState((prev) =>
                  updateSubItem(prev, 'character_script', task.id, {
                    status: 'failed',
                    error: errorMsg,
                  }),
                );
              } else if (eventType === 'chunk') {
                // 灏?chunk 杩藉姞鍒扮埗闃舵鐨?streamedText锛屼緵 UI 棰勮
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
              // 闂?JSON閿涘苯鎷烽悾銉ョ摍娴犺濮熺痪褍鍩嗛惃鍕嚱閺傚洦婀?
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
            finish(false);
          },
          onClose: () => {
            if (controller.signal.aborted) {
              setState((prev) =>
                updateSubItem(prev, 'character_script', task.id, {
                  status: 'failed',
                  error: '用户中断',
                }),
              );
              finish(false);
            } else if (!subTaskCompleted && !subTaskFailed) {
              setState((prev) =>
                updateSubItem(prev, 'character_script', task.id, {
                  status: 'failed',
                  error: '流意外关闭',
                }),
              );
              finish(false);
            } else {
              finish(subTaskCompleted && !subTaskFailed);
            }
          },
        });
      });
    },
    [registerAbortController],
  );

  // ===== runPhaseBatch閿涙岸妯佸▓?2 鐟欐帟澹婇崜褎婀伴幍瑙勵偧鐠嬪啫瀹?=====
  const runPhaseBatch = useCallback(
    async (
      tasks: CharacterScriptTask[],
      params: ScriptGenerationParams,
    ): Promise<void> => {
      // 閸掓繂顫愰崠?/ 婢跺秶鏁?subItems
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

      for (let i = 0; i < tasks.length; i += CHARACTER_SCRIPT_CONCURRENCY) {
        const batch = tasks.slice(i, i + CHARACTER_SCRIPT_CONCURRENCY);
        const results = await Promise.all(
          batch.map((task) => runCharacterScriptSubTask(task, params)),
        );
        if (results.some((success) => !success)) {
          setState((prev) =>
            updatePhase(prev, 'character_script', {
              status: 'failed',
              percent: 100,
            }),
          );
          throw new Error('玩家剧本生成未全部完成');
        }
      }

      // 閸忋劑鍎寸€瑰本鍨氶崥搴㈢垼鐠佷即妯佸▓闈涚暚閹?/ 婢惰精瑙?
      setState((prev) =>
        updatePhase(prev, 'character_script', {
          status: 'completed',
          percent: 100,
        }),
      );
    },
    [runCharacterScriptSubTask],
  );

  // ===== start閿涙艾鎯庨崝銊ュ弿濞翠胶鈻?=====
  const start = useCallback(
    async (params: ScriptGenerationParams): Promise<void> => {
      paramsRef.current = params;

      try {
        // 鍒涘缓绌?script 琛?
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error('未登录，请先登录后再生成剧本');

        // 楠岃瘉褰撳墠浼氳瘽鐢ㄦ埛鐪熷疄瀛樺湪
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          throw new Error('登录会话无效，请重新登录后再生成剧本');
        }

        // 绾喕绻?public.users 娑擃厼鐡ㄩ崷銊ョ秼閸撳秶鏁ら幋鐤唶瑜版洩绱濋崶鐘辫礋 scripts.author_id
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
            console.error('同步 public.users 失败:', upsertError);
            throw new Error(`同步用户记录失败: ${upsertError.message}`);
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
          throw new Error('创建剧本失败: 未返回剧本 ID');
        }

        scriptIdRef.current = scriptRow.id;
        setState((prev) => ({
          ...prev,
          scriptId: scriptRow.id,
          orchestrationStatus: 'running',
          currentPhase: 'story_bible',
        }));

        // 闂冭埖顔?0
        await runPhase('story_bible', params);
        // phase 0 瀹屾垚鍚?orchestrationStatus='paused_at_gate'
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

  // ===== confirmStoryBible閿涙氨鈥樼拋銈夋闂?閳?闂冭埖顔?1-3 =====
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
        // 闂冭埖顔?1閿涙矮姹夐悧鈺勵啎鐎?+ 閸掑棗绠风紒鎾寸€?楠炴儼顢?
        await Promise.all([
          runPhase('character_profiles', params),
          runPhase('act_structure', params),
        ]);

        // 鐠囪褰?characters 鐞涖劏骞忛崣鏍潡閼?ID 閸掓銆?
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

        // 闃舵 2锛氭寜瑙掕壊鍓ф湰浠芥暟鍒嗘壒骞惰
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

        // 闂冭埖顔?3閿涙氨鍤庣槐銏犲幢 + 缂佸嫮绮愰懓鍛閸?+ 閻喓娴夋径宥囨磸 楠炴儼顢?
        setState((prev) => ({ ...prev, currentPhase: 'clues' }));
        await runPhase('clues', params);
        await Promise.all([
          runPhase('organizer_manual', params),
          runPhase('truth_review', params),
        ]);

        // 闃舵 4锛氭椂闂寸嚎缁撴瀯鍖栵紙渚濊禆 truth_review 瀹屾垚锛?
        setState((prev) => ({ ...prev, currentPhase: 'timeline_structure' }));
        await runPhase('timeline_structure', params);

        // 閸忋劑鍎寸€瑰本鍨?
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

  // ===== regenerateStoryBible閿涙岸鍣搁弬鎵晸閹存劙妯佸▓?0 =====
  const regenerateStoryBible = useCallback(
    async (): Promise<void> => {
      if (state.orchestrationStatus !== 'paused_at_gate') return;

      const params = paramsRef.current;
      if (!params) return;

      // 閲嶇疆闃舵 0 鐘舵€?
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

  // ===== retryPhase閿涙岸鍣哥拠鏇炲礋娑擃亜銇戠拹銉╂▉濞?=====
  const retryPhase = useCallback(
    async (phaseId: PhaseId): Promise<void> => {
      const params = paramsRef.current;
      if (!params) return;

      // 闁插秶鐤嗛幐鍥х暰闂冭埖顔岄悩鑸碘偓浣疯礋 pending
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
          // 鐟欐帟澹婇崜褎婀伴梼鑸殿唽闂団偓闁插秵鏌婄拠璇插絿 characters 鐞涖劏骞忛崣?ID 閸掓銆?
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

          // 闁插秶鐤?subItems
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

  // ===== abort閿涙矮鑵戦弬顓炵秼閸撳秶鏁撻幋?=====
  const abort = useCallback((): void => {
    abortActiveRequests();
    setState((prev) => {
      if (!prev.currentPhase) return prev;
      return {
        ...updatePhase(prev, prev.currentPhase, {
          status: 'failed',
          error: '用户中断',
        }),
        orchestrationStatus: 'failed',
      };
    });
  }, [abortActiveRequests]);

  // ===== reset閿涙岸鍣哥純顔煎弿闁劎濮搁幀?=====
  const reset = useCallback((): void => {
    abortActiveRequests();
    paramsRef.current = null;
    scriptIdRef.current = null;
    setState(createInitialState());
  }, [abortActiveRequests]);

  // ===== resumeFromScript閿涙矮绮犲鍙夋箒 scriptId 閹垹顦?=====
  // 濡偓濞?7 瀵姾銆冮惃鍕暚閹存劗濮搁幀渚婄礉閸ョ偛锝炲鎻掔暚閹存劙妯佸▓鍏哥瑢鐠佹儳鐣鹃張顒婄礉
  // 鏍规嵁 storyBible.confirmed 鍐冲畾鍋滃湪 paused_at_gate 杩樻槸缁х画鍚庣画闃舵
  const resumeFromScript = useCallback(
    async (scriptId: string, params?: ScriptGenerationParams): Promise<void> => {
      const supabase = createClient();

      // 骞惰鏌ヨ 7 寮犺〃锛屽垽鏂悇闃舵瀹屾垚鐘舵€?
      const [
        storyBibleRes,
        charactersRes,
        actsRes,
        characterScriptsRes,
        cluesRes,
        organizerManualRes,
        truthReviewRes,
        timelineEventsRes,
        actGenerationTaskRes,
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
        supabase
          .from('generation_tasks')
          .select('result_data')
          .eq('script_id', scriptId)
          .eq('task_type', 'ACT_STRUCTURE')
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
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
      const restoredGenerationSpec = (
        actGenerationTaskRes.data as { result_data?: { generationSpec?: CharacterScriptGenerationSpec } } | null
      )?.result_data?.generationSpec;
      const expectedCharacterScriptCount = getExpectedCharacterScriptCount(
        charactersList.length || params?.players || 1,
        restoredGenerationSpec,
      );
      const charactersExist = charactersList.length > 0;
      const actsExists = (actsRes.count ?? 0) > 0;
      const characterScriptsExists = (characterScriptsRes.count ?? 0) >= expectedCharacterScriptCount;
      const cluesExists = (cluesRes.count ?? 0) > 0;
      const organizerManualExists = !!organizerManualRes.data;
      const truthReviewExists = !!truthReviewRes.data;
      const timelineEventsExists = (timelineEventsRes.count ?? 0) > 0;

      // 闂冭埖顔?0 閺堫亜鐣幋鎰剁窗娑撳秴褰查幁銏狀槻閿涘奔绻氶幐?idle
      if (!storyBibleExists) {
        return;
      }

      // 鍥炲～宸插畬鎴愰樁娈电姸鎬?
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

      // 鍥炲～璁惧畾鏈紝鐢ㄤ簬闂搁棬 UI
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

      // 閸氬本顒?refs閿涘奔濞囬崥搴ｇ敾 retryPhase / confirmStoryBible 閸欘垳鏁?
      scriptIdRef.current = scriptId;
      if (params) {
        paramsRef.current = params;
      }

      // 閸愬啿鐣鹃幁銏狀槻閸掓澘鎽㈡稉顏嗗Ц閹緤绱?
      // - 閸忋劑鍎寸€瑰本鍨?閳?completed
      // - 闃舵 0 瀹屾垚浣嗘湭纭 -> paused_at_gate
      // - 闃舵 0 宸茬‘璁や絾鍚庣画鏈叏閮ㄥ畬鎴?-> paused_at_gate
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

// 瀵煎嚭甯搁噺渚涘閮ㄤ娇鐢?
export { PHASE_LABELS, PHASE_ORDER };
