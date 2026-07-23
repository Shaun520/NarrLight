/**
 * Supabase 数据库类型定义
 *
 * 由 Supabase CLI 自动生成，此处为手动维护的基础类型定义。
 * 正式环境应使用 `supabase gen types typescript --project-id <id>` 生成完整类型。
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          phone: string;
          nickname: string;
          avatar_url: string | null;
          free_quota_used: number;
          free_quota_limit: number;
          plan_type: "free" | "pro";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          phone: string;
          nickname?: string;
          avatar_url?: string | null;
          free_quota_used?: number;
          free_quota_limit?: number;
          plan_type?: "free" | "pro";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          phone?: string;
          nickname?: string;
          avatar_url?: string | null;
          free_quota_used?: number;
          free_quota_limit?: number;
          plan_type?: "free" | "pro";
          created_at?: string;
          updated_at?: string;
        };
      };
      user_credits: {
        Row: {
          user_id: string;
          balance: number;
          monthly_grant: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          balance?: number;
          monthly_grant?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_credits"]["Row"]>;
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          task_id: string | null;
          amount: number;
          type: "grant" | "consume" | "refund" | "adjustment";
          reason: string;
          metadata: Json;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["credit_transactions"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["credit_transactions"]["Row"]>;
      };
      scripts: {
        Row: {
          id: string;
          author_id: string;
          title: string;
          description: string;
          genre: "hardcore" | "emotion" | "horror" | "funny" | "mechanism";
          player_count: number;
          duration_hours: number;
          difficulty: "beginner" | "intermediate" | "advanced" | "expert";
          background_setting: string;
          core_theme: string;
          status: "draft" | "generating" | "completed" | "archived";
          word_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          title: string;
          description?: string;
          genre: "hardcore" | "emotion" | "horror" | "funny" | "mechanism";
          player_count?: number;
          duration_hours?: number;
          difficulty?: "beginner" | "intermediate" | "advanced" | "expert";
          background_setting?: string;
          core_theme?: string;
          status?: "draft" | "generating" | "completed" | "archived";
          word_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          title?: string;
          description?: string;
          genre?: "hardcore" | "emotion" | "horror" | "funny" | "mechanism";
          player_count?: number;
          duration_hours?: number;
          difficulty?: "beginner" | "intermediate" | "advanced" | "expert";
          background_setting?: string;
          core_theme?: string;
          status?: "draft" | "generating" | "completed" | "archived";
          word_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      characters: {
        Row: {
          id: string;
          script_id: string;
          name: string;
          role_identity: string;
          gender: "male" | "female" | "unknown" | "";
          age: number | null;
          personality: string;
          background_story: string;
          personal_task: string;
          is_murderer: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["characters"]["Row"], "created_at"> & { created_at?: string };
        Update: Partial<Database["public"]["Tables"]["characters"]["Row"]>;
      };
      player_packages: {
        Row: {
          id: string;
          script_id: string;
          player_seat_id: string;
          identity_assignment_id: string | null;
          package_order: number;
          package_title: string;
          current_identity: string;
          read_order: number;
          package_type: "initial" | "act" | "supplement" | "ending";
          content_json: Json;
          word_count: number;
          generation_status: "pending" | "running" | "completed" | "failed";
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["player_packages"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["player_packages"]["Row"]>;
      };
      acts: {
        Row: {
          id: string;
          script_id: string;
          title: string;
          sort_order: number;
          content: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["acts"]["Row"], "created_at"> & { created_at?: string };
        Update: Partial<Database["public"]["Tables"]["acts"]["Row"]>;
      };
      scenes: {
        Row: {
          id: string;
          act_id: string;
          title: string;
          location: string;
          content: string;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["scenes"]["Row"], "created_at"> & { created_at?: string };
        Update: Partial<Database["public"]["Tables"]["scenes"]["Row"]>;
      };
      clues: {
        Row: {
          id: string;
          script_id: string;
          title: string;
          content: string;
          clue_type: "physical" | "testimony" | "deep" | "hidden";
          search_round: number;
          location: string;
          related_character_ids: string[];
          is_distractor: boolean;
          is_key_clue: boolean;
          unlock_condition: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["clues"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clues"]["Row"]>;
      };
      character_relations: {
        Row: {
          id: string;
          script_id: string;
          source_character_id: string;
          target_character_id: string;
          relation_type: "family" | "friend" | "lover" | "enemy" | "colleague" | "conspiracy" | "other";
          label: string;
          is_visible: boolean;
          is_hidden_relation: boolean;
          hidden_label: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["character_relations"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["character_relations"]["Row"]>;
      };
      timeline_events: {
        Row: {
          id: string;
          script_id: string;
          character_id: string | null;
          event_time: string;
          event_description: string;
          location: string;
          act_order: number | null;
          is_narrative_trick: boolean;
          trick_type: "time" | "identity" | "perspective" | "other" | "";
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["timeline_events"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["timeline_events"]["Row"]>;
      };
      version_snapshots: {
        Row: {
          id: string;
          script_id: string;
          version_number: number;
          snapshot_data: Json;
          change_summary: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["version_snapshots"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["version_snapshots"]["Row"]>;
      };
      generation_tasks: {
        Row: {
          id: string;
          script_id: string;
          task_type:
            | "FULL_SCRIPT"
            | "CHARACTER_ADJUST"
            | "CLUE_MODIFY"
            | "TRICK_REPLACE"
            | "STYLE_CHANGE"
            | "COMPRESS"
            | "COMPLIANCE"
            | "ILLUSTRATION"
            | "STORY_BIBLE"
            | "CHARACTER_PROFILES"
            | "ACT_STRUCTURE"
            | "CHARACTER_SCRIPT"
            | "CLUES"
            | "ORGANIZER_MANUAL"
            | "TRUTH_REVIEW"
            | "TIMELINE_STRUCTURE";
          status: "pending" | "running" | "completed" | "failed" | "cancelled";
          params: Json;
          progress_percent: number;
          result_data: Json | null;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          quality_status: "unchecked" | "passed" | "failed" | "disputed" | "refunded";
          retry_of_task_id: string | null;
          retry_count: number;
          max_retries: number;
          charged_credits: number;
          refund_credits: number;
          failure_reason: string | null;
          user_feedback: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["generation_tasks"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["generation_tasks"]["Row"]>;
      };
      validation_reports: {
        Row: {
          id: string;
          script_id: string;
          report_type: "TIMELINE" | "LOGIC" | "DIFFICULTY" | "FULL";
          status: "in_progress" | "completed" | "cancelled";
          result_data: Json;
          issue_count_severe: number;
          issue_count_warning: number;
          issue_count_hint: number;
          script_version_ref: number | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["validation_reports"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["validation_reports"]["Row"]>;
      };
      difficulty_assessments: {
        Row: {
          id: string;
          script_id: string;
          overall_score: number;
          overall_level: "easy" | "normal" | "hard" | "extreme" | "";
          clue_count: number;
          distractor_ratio: number;
          trick_complexity: number;
          genre_weighted_score: number;
          detail_breakdown: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["difficulty_assessments"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["difficulty_assessments"]["Row"]>;
      };
      illustration_market_items: {
        Row: {
          id: string;
          title: string;
          task_type: "cover" | "scene" | "clue" | "public" | "char" | "poster";
          subtitle: string;
          prompt_hint: string;
          visual_tone: string;
          thumb_url: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["illustration_market_items"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["illustration_market_items"]["Row"]>;
      };
      illustration_style_profiles: {
        Row: {
          id: string;
          script_id: string;
          style_name: string;
          visual_tone: string;
          master_prompt: string;
          reference_notes: string;
          market_item_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["illustration_style_profiles"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["illustration_style_profiles"]["Row"]>;
      };
      illustration_tasks: {
        Row: {
          id: string;
          script_id: string;
          style_profile_id: string;
          asset_id: string | null;
          market_item_id: string | null;
          task_key: string;
          task_type: "cover" | "scene" | "clue" | "public" | "char" | "poster";
          source_type: string;
          source_id: string;
          title: string;
          subtitle: string;
          prompt: string;
          status: "pending" | "running" | "completed" | "failed" | "cancelled";
          progress_percent: number;
          sort_order: number;
          selected_model: string;
          selected_ratio: string;
          selected_count: number;
          result_image_url: string;
          error_message: string;
          quality_status: "unchecked" | "passed" | "warning";
          quality_message: string;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["illustration_tasks"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["illustration_tasks"]["Row"]>;
      };
      system_configs: {
        Row: {
          key: string;
          value: Json;
          description: string;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value?: Json;
          description?: string;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["system_configs"]["Row"]>;
      };
    };
  };
}
