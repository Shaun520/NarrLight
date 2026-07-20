/**
 * 社区内容服务
 *
 * 提供创作社区（视图9）的内容读写能力，包括：
 * - 社区内容列表（瀑布流卡片）查询、详情、创建
 * - 点赞 / 加入拼车 / 关注作者 等互动操作
 * - 热门话题、推荐作者、热门剧本榜
 * - 社区脉搏统计
 *
 * 当前为开发期 Mock 实现，数据与 docs/prototype/workbench2.html
 * 中 #view-community 的示例保持一致，后续接入真实数据库时替换方法体即可。
 */

// ===================== 通用类型 =====================

/** 创作社区视角 */
export type Perspective = "creator" | "player";

/** 社区分类 key（与 category-tabs 的 data-cat 对齐） */
export type CategoryKey =
  | "recommend"
  | "carpool"
  | "review"
  | "guide"
  | "talk"
  | "ask"
  | "following";

/** 卡片业务类型 */
export type CardType = "carpool" | "review" | "guide" | "rec" | "ask" | "talk";

/** 封面渐变变体（对应 CSS .c1 ~ .c8） */
export type CoverVariant = "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "c7" | "c8";

/** 封面高度档位 */
export type CoverHeight = "h-tall" | "h-mid" | "h-short";

/** 徽标样式变体（对应 CSS .b-rec / .b-carpool / ...） */
export type BadgeVariant =
  | "b-rec"
  | "b-carpool"
  | "b-guide"
  | "b-review"
  | "b-talk"
  | "b-ask";

/** 互动统计类型 */
export type StatType = "like" | "comment" | "star";

// ===================== 数据结构 =====================

/** 作者简要信息 */
export interface AuthorBrief {
  /** 头像首字 */
  avatarChar: string;
  /** 作者名（含时间，如 "苏沐 · 2h前"） */
  name: string;
  /** 是否已认证 */
  verified?: boolean;
}

/** 单条互动统计 */
export interface PostStat {
  type: StatType;
  count: number;
  /** 仅 like 类型用：是否已点赞 */
  liked?: boolean;
}

/** 拼车座位进度 */
export interface SeatInfo {
  filled: number;
  total: number;
  /** 是否已满员（满员变绿） */
  full?: boolean;
}

/** 封面信息（纯文字卡无封面） */
export interface CoverInfo {
  variant: CoverVariant;
  height: CoverHeight;
  title: string;
}

/** 社区内容（瀑布流卡片数据） */
export interface CommunityPost {
  id: string;
  /** 卡片业务类型 */
  type: CardType;
  /** 是否为纯文字卡（无封面） */
  isTextCard?: boolean;
  /** 封面（纯文字卡为空） */
  cover?: CoverInfo;
  /** 徽标 */
  badge: { label: string; variant: BadgeVariant };
  /** 角标（如 "急招 2人" / "DM 必读"） */
  stamp?: string;
  /** 标题（2 行截断） */
  title: string;
  /** 摘要（2 行截断） */
  excerpt?: string;
  /** 标签 */
  tags: string[];
  /** 作者 */
  author: AuthorBrief;
  /** 互动统计（与 joinLabel 互斥） */
  stats?: PostStat[];
  /** 拼车座位进度 */
  seat?: SeatInfo;
  /** 加入按钮文案（与 stats 互斥） */
  joinLabel?: string;
  /** 加入按钮是否禁用（如 "候补排队"） */
  joinDisabled?: boolean;
}

/** 社区脉搏单条 */
export interface PulseStat {
  num: string;
  lbl: string;
}

/** 热门话题 */
export interface CommunityTopic {
  rank: number;
  name: string;
  /** 热度数值（如 "2.4w"） */
  hot?: string;
  /** 标签（如 "热"） */
  tag?: string;
}

/** 推荐作者 */
export interface RecommendedAuthor {
  avatarChar: string;
  /** 头像背景 CSS（inline style 用） */
  avatarBg: string;
  name: string;
  verified?: boolean;
  meta: string;
  followed?: boolean;
}

/** 热门剧本榜条目 */
export interface RankScript {
  /** 序号展示文本（如 "01"） */
  no: string;
  rank: number;
  /** 封面背景 CSS（inline style 用） */
  coverBg: string;
  name: string;
  sub: string;
}

/** 内容查询过滤条件 */
export interface PostFilters {
  category?: CategoryKey;
  chip?: string;
  keyword?: string;
  perspective?: Perspective;
  page?: number;
  pageSize?: number;
}

/** 互动操作结果 */
export interface InteractionResult {
  success: boolean;
  /** 操作后的当前状态 */
  active?: boolean;
  /** 操作后的计数（点赞用） */
  count?: number;
}

// ===================== Mock 数据 =====================

const MOCK_POSTS: CommunityPost[] = [
  {
    id: "p1",
    type: "carpool",
    cover: { variant: "c1", height: "h-tall", title: "雾港夜话" },
    badge: { label: "拼车", variant: "b-carpool" },
    stamp: "急招 2人",
    title: "今晚 19:30 · 上海徐汇 · DM 老张亲带",
    tags: ["情感", "民国", "6人", "5h"],
    author: { avatarChar: "苏", name: "苏沐 · 2h前" },
    stats: [
      { type: "like", count: 32 },
      { type: "comment", count: 8 },
    ],
    seat: { filled: 4, total: 6 },
  },
  {
    id: "p2",
    type: "review",
    cover: { variant: "c2", height: "h-mid", title: "长安十二时辰谜" },
    badge: { label: "测评", variant: "b-review" },
    title: "硬核玩家的狂欢，但时序线还需打磨",
    excerpt: "核心诡计设计惊艳，但卯时三刻的线索链存在断点，期待正式版优化……",
    tags: ["硬核", "古风", "7人", "★★★★☆"],
    author: { avatarChar: "陈", name: "陈一鸣 · 5h前" },
    stats: [
      { type: "like", count: 156, liked: true },
      { type: "comment", count: 32 },
    ],
  },
  {
    id: "p3",
    type: "guide",
    cover: { variant: "c3", height: "h-short", title: "新手 DM 带本指南" },
    badge: { label: "攻略", variant: "b-guide" },
    stamp: "DM 必读",
    title: "如何把控情感本第二幕节奏",
    excerpt: "带过 20+ 车情感本总结，重点讲音乐切入时机、独白引导话术、处理玩家情绪过度沉浸……",
    tags: ["攻略", "DM", "情感本"],
    author: { avatarChar: "老", name: "老张 · 5h前" },
    stats: [
      { type: "like", count: 218 },
      { type: "comment", count: 45 },
    ],
  },
  {
    id: "p4",
    type: "carpool",
    cover: { variant: "c5", height: "h-mid", title: "星轨彼端" },
    badge: { label: "拼车", variant: "b-carpool" },
    title: "周日 18:00 · 广州天河 · 新手友好车",
    tags: ["科幻", "6人", "含教学"],
    author: { avatarChar: "林", name: "林晚秋 · 6h前" },
    seat: { filled: 6, total: 6, full: true },
    joinLabel: "候补排队",
    joinDisabled: true,
  },
  {
    id: "p5",
    type: "rec",
    cover: { variant: "c4", height: "h-tall", title: "雨夜独行" },
    badge: { label: "推荐", variant: "b-rec" },
    stamp: "★ 4.6",
    title: "暴雨困住五个陌生人，每个人都在说谎",
    excerpt: "现代悬疑天花板，5人本 4h，新手也能沉浸，节奏紧凑到最后一刻。",
    tags: ["悬疑", "现代", "5人", "184评"],
    author: { avatarChar: "夜", name: "夜行者 · 1d前" },
    joinLabel: "加入心愿单",
  },
  {
    id: "p6",
    type: "ask",
    isTextCard: true,
    badge: { label: "求助", variant: "b-ask" },
    title: "古风本的伏笔应该埋多深？",
    excerpt:
      "第一本写到第二幕卡住了，担心线索给太明显玩家秒破，又怕太隐晦复盘时被骂强行反转。求一个平衡的尺度……",
    tags: ["创作", "古风", "新手作者"],
    author: { avatarChar: "江", name: "江晚意 · 2d前" },
    stats: [
      { type: "like", count: 67 },
      { type: "comment", count: 19 },
    ],
  },
  {
    id: "p7",
    type: "review",
    cover: { variant: "c6", height: "h-mid", title: "雾港夜话" },
    badge: { label: "复盘", variant: "b-review" },
    stamp: "⚠ 剧透",
    title: "柳如烟真正身份的三种解读（含真凶复盘）",
    excerpt: "玩了三车后整理的时间线闭环，重点论证“信件邮戳”这个被忽略的伏笔……",
    tags: ["剧透", "复盘", "情感"],
    author: { avatarChar: "陆", name: "陆星河 · 2h前" },
    stats: [
      { type: "like", count: 342, liked: true },
      { type: "comment", count: 87 },
    ],
  },
  {
    id: "p8",
    type: "carpool",
    cover: { variant: "c7", height: "h-short", title: "上海·长期固定车友" },
    badge: { label: "招募", variant: "b-carpool" },
    title: "每周末·情感/硬核轮换，求 2-4 位长期车友",
    excerpt: "已有 4 人固定班底，要求守时、不鸽、沉浸度在线。剧本库 50+，场地徐汇。",
    tags: ["同城", "上海", "长期"],
    author: { avatarChar: "苏", name: "苏沐 · 1d前" },
    joinLabel: "立即加入",
  },
  {
    id: "p9",
    type: "rec",
    cover: { variant: "c8", height: "h-tall", title: "雾港夜话" },
    badge: { label: "新发行", variant: "b-rec" },
    stamp: "本周精选",
    title: "1937 雾港码头，迟到十年的家书",
    excerpt: "六位旧识在雨夜重逢，却没人能说出当年的真相——这一次，沉默不再是答案。",
    tags: ["情感", "民国", "6人", "★4.7"],
    author: { avatarChar: "沈", name: "沈墨白 · 已认证", verified: true },
    stats: [
      { type: "like", count: 327 },
      { type: "star", count: 4.7 },
    ],
  },
];

const MOCK_PULSE: PulseStat[] = [
  { num: "37", lbl: "今日新发行" },
  { num: "126", lbl: "在线拼车局" },
  { num: "489", lbl: "24H 评价" },
  { num: "214", lbl: "活跃创作者" },
];

const MOCK_TOPICS: CommunityTopic[] = [
  { rank: 1, name: "#雾港夜话真凶解读", tag: "热" },
  { rank: 2, name: "#长安十二时辰谜线索断点", hot: "2.4w" },
  { rank: 3, name: "#新手DM带本指南", hot: "1.8w" },
  { rank: 4, name: "#古风本伏笔尺度", hot: "9.6k" },
  { rank: 5, name: "#上海长期车友招募", hot: "7.2k" },
  { rank: 6, name: "#星轨彼端新手车", hot: "5.1k" },
];

const MOCK_AUTHORS: RecommendedAuthor[] = [
  {
    avatarChar: "沈",
    avatarBg: "linear-gradient(135deg,var(--gold),var(--blood))",
    name: "沈墨白",
    verified: true,
    meta: "情感/民国 · 4 部 · 1.2w 粉",
  },
  {
    avatarChar: "青",
    avatarBg: "linear-gradient(135deg,#3a6b4a,#1f3a2b)",
    name: "青衫客",
    meta: "硬核/古风 · 7 部 · 8.6k 粉",
  },
  {
    avatarChar: "夜",
    avatarBg: "linear-gradient(135deg,#3a5266,#1f2e3a)",
    name: "夜行者",
    meta: "悬疑/现代 · 5 部 · 5.4k 粉",
    followed: true,
  },
];

const MOCK_RANK: RankScript[] = [
  {
    no: "01",
    rank: 1,
    coverBg:
      "linear-gradient(135deg,rgba(58,42,26,0.5),rgba(26,20,16,0.7)),url('https://picsum.photos/seed/narrRk1/64/84?grayscale') center/cover",
    name: "雾港夜话",
    sub: "★4.7 · 1,284 游玩",
  },
  {
    no: "02",
    rank: 2,
    coverBg:
      "linear-gradient(135deg,rgba(26,42,42,0.5),rgba(13,24,24,0.7)),url('https://picsum.photos/seed/narrRk2/64/84?grayscale') center/cover",
    name: "雨夜独行",
    sub: "★4.6 · 982 游玩",
  },
  {
    no: "03",
    rank: 3,
    coverBg:
      "linear-gradient(135deg,rgba(42,26,42,0.5),rgba(26,13,24,0.7)),url('https://picsum.photos/seed/narrRk3/64/84?grayscale') center/cover",
    name: "长安十二时辰谜",
    sub: "★4.4 · 642 游玩",
  },
  {
    no: "04",
    rank: 4,
    coverBg:
      "linear-gradient(135deg,rgba(26,26,42,0.5),rgba(13,13,24,0.7)),url('https://picsum.photos/seed/narrRk4/64/84?grayscale') center/cover",
    name: "星轨彼端",
    sub: "★4.5 · 588 游玩",
  },
  {
    no: "05",
    rank: 5,
    coverBg:
      "linear-gradient(135deg,rgba(42,42,26,0.5),rgba(24,24,16,0.7)),url('https://picsum.photos/seed/narrRk5/64/84?grayscale') center/cover",
    name: "青瓷记",
    sub: "★4.3 · 467 游玩",
  },
];

// ===================== 服务实现 =====================

/**
 * 创作社区内容服务
 *
 * 所有方法均为 async，便于后续无缝替换为真实数据库 / API 调用。
 */
export class CommunityService {
  /**
   * 获取社区内容列表（支持分类、筛选、分页）。
   * 开发期返回完整 Mock 列表；接入真实后端后按 filters 过滤。
   */
  async getPosts(filters?: PostFilters): Promise<CommunityPost[]> {
    void filters; // 预留：接入后端后按分类/筛选/关键词过滤
    return Promise.resolve(MOCK_POSTS);
  }

  /**
   * 获取单个内容详情。
   */
  async getPost(postId: string): Promise<CommunityPost | null> {
    return Promise.resolve(MOCK_POSTS.find((p) => p.id === postId) ?? null);
  }

  /**
   * 创建内容（开发期仅返回占位结果）。
   */
  async createPost(
    data: Omit<CommunityPost, "id">,
  ): Promise<CommunityPost> {
    const post: CommunityPost = { ...data, id: `p_${Date.now()}` };
    return Promise.resolve(post);
  }

  /**
   * 点赞 / 取消点赞。
   * @returns 操作结果，active 表示点赞后状态，count 表示点赞后计数。
   */
  async likePost(postId: string): Promise<InteractionResult> {
    void postId;
    return Promise.resolve({ success: true });
  }

  /**
   * 加入拼车（开发期仅返回成功占位）。
   */
  async joinCarpool(postId: string): Promise<InteractionResult> {
    void postId;
    return Promise.resolve({ success: true, active: true });
  }

  /**
   * 关注 / 取消关注作者。
   */
  async followAuthor(authorId: string): Promise<InteractionResult> {
    void authorId;
    return Promise.resolve({ success: true });
  }

  /**
   * 热门话题列表。
   */
  async getTopics(): Promise<CommunityTopic[]> {
    return Promise.resolve(MOCK_TOPICS);
  }

  /**
   * 推荐作者列表。
   */
  async getRecommendedAuthors(): Promise<RecommendedAuthor[]> {
    return Promise.resolve(MOCK_AUTHORS);
  }

  /**
   * 热门剧本榜。
   */
  async getHotScripts(): Promise<RankScript[]> {
    return Promise.resolve(MOCK_RANK);
  }

  /**
   * 社区脉搏统计。
   */
  async getPulseStats(): Promise<PulseStat[]> {
    return Promise.resolve(MOCK_PULSE);
  }
}

/** 社区服务单例（开发期 Mock 使用） */
export const communityService = new CommunityService();
