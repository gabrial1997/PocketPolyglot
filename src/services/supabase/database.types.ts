// GENERATED from the live Supabase schema (supabase gen types / MCP generate_typescript_types).
// Source of truth for DB row shapes. Regenerate after any migration. The hand-curated `types.ts`
// in this folder is a minimal subset the service layer maps from; prefer these for new code.
/* eslint-disable */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audio_assets: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          owner_type: string
          rate: string
          storage_path: string
          voice_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          owner_type: string
          rate?: string
          storage_path: string
          voice_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          owner_type?: string
          rate?: string
          storage_path?: string
          voice_id?: string
        }
        Relationships: []
      }
      lemmas: {
        Row: {
          cefr: string | null
          created_at: string
          examples: Json | null
          freq_band: number | null
          freq_count: number | null
          freq_rank: number | null
          gloss_en: string
          id: string
          lemma: string
          media: Json | null
          mnemonic: Json | null
          native_url: string | null
          phonetic_key: string | null
          pos: string | null
          pron: string | null
          qa_status: string
          semantic_field: string | null
          slow_url: string | null
          updated_at: string
          word_class: string
        }
        Insert: {
          cefr?: string | null
          created_at?: string
          examples?: Json | null
          freq_band?: number | null
          freq_count?: number | null
          freq_rank?: number | null
          gloss_en: string
          id?: string
          lemma: string
          media?: Json | null
          mnemonic?: Json | null
          native_url?: string | null
          phonetic_key?: string | null
          pos?: string | null
          pron?: string | null
          qa_status?: string
          semantic_field?: string | null
          slow_url?: string | null
          updated_at?: string
          word_class: string
        }
        Update: {
          cefr?: string | null
          created_at?: string
          examples?: Json | null
          freq_band?: number | null
          freq_count?: number | null
          freq_rank?: number | null
          gloss_en?: string
          id?: string
          lemma?: string
          media?: Json | null
          mnemonic?: Json | null
          native_url?: string | null
          phonetic_key?: string | null
          pos?: string | null
          pron?: string | null
          qa_status?: string
          semantic_field?: string | null
          slow_url?: string | null
          updated_at?: string
          word_class?: string
        }
        Relationships: []
      }
      minimal_pairs: {
        Row: {
          a: string
          audio_url: string
          b: string
          contrast_type: string
          correct: string
          created_at: string
          id: string
          qa_status: string
        }
        Insert: {
          a: string
          audio_url: string
          b: string
          contrast_type: string
          correct: string
          created_at?: string
          id?: string
          qa_status?: string
        }
        Update: {
          a?: string
          audio_url?: string
          b?: string
          contrast_type?: string
          correct?: string
          created_at?: string
          id?: string
          qa_status?: string
        }
        Relationships: []
      }
      phrase_components: {
        Row: {
          is_new: boolean
          lemma_id: string
          phrase_id: string
          position: number | null
        }
        Insert: {
          is_new?: boolean
          lemma_id: string
          phrase_id: string
          position?: number | null
        }
        Update: {
          is_new?: boolean
          lemma_id?: string
          phrase_id?: string
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "phrase_components_lemma_id_fkey"
            columns: ["lemma_id"]
            isOneToOne: false
            referencedRelation: "lemmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phrase_components_phrase_id_fkey"
            columns: ["phrase_id"]
            isOneToOne: false
            referencedRelation: "phrases"
            referencedColumns: ["id"]
          },
        ]
      }
      phrases: {
        Row: {
          audio_url: string | null
          created_at: string
          gloss_en: string
          id: string
          is_idiom: boolean
          qa_status: string
          seed: string | null
          target: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          gloss_en: string
          id?: string
          is_idiom?: boolean
          qa_status?: string
          seed?: string | null
          target: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          gloss_en?: string
          id?: string
          is_idiom?: boolean
          qa_status?: string
          seed?: string | null
          target?: string
        }
        Relationships: []
      }
      podcast_episodes: {
        Row: {
          audio_url: string
          created_at: string
          id: string
          lemma_ids: string[] | null
          level_band: number | null
          title: string
          transcript: string | null
        }
        Insert: {
          audio_url: string
          created_at?: string
          id?: string
          lemma_ids?: string[] | null
          level_band?: number | null
          title: string
          transcript?: string | null
        }
        Update: {
          audio_url?: string
          created_at?: string
          id?: string
          lemma_ids?: string[] | null
          level_band?: number | null
          title?: string
          transcript?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          rec_consent: boolean
          rec_consent_at: string | null
          settings: Json
          training_consent: boolean
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          rec_consent?: boolean
          rec_consent_at?: string | null
          settings?: Json
          training_consent?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          rec_consent?: boolean
          rec_consent_at?: string | null
          settings?: Json
          training_consent?: boolean
        }
        Relationships: []
      }
      recordings: {
        Row: {
          consent_at: string
          created_at: string
          duration_ms: number | null
          id: string
          score: number | null
          score_payload: Json | null
          storage_path: string
          user_id: string
        }
        Insert: {
          consent_at: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          score?: number | null
          score_payload?: Json | null
          storage_path: string
          user_id: string
        }
        Update: {
          consent_at?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          score?: number | null
          score_payload?: Json | null
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      review_log: {
        Row: {
          card_kind: string
          correct: boolean | null
          created_at: string
          id: string
          interval_label: string | null
          item_id: string
          item_type: string
          latency_ms: number | null
          recording_id: string | null
          self_rating: string | null
          spoke: boolean | null
          user_id: string
        }
        Insert: {
          card_kind: string
          correct?: boolean | null
          created_at?: string
          id?: string
          interval_label?: string | null
          item_id: string
          item_type: string
          latency_ms?: number | null
          recording_id?: string | null
          self_rating?: string | null
          spoke?: boolean | null
          user_id: string
        }
        Update: {
          card_kind?: string
          correct?: boolean | null
          created_at?: string
          id?: string
          interval_label?: string | null
          item_id?: string
          item_type?: string
          latency_ms?: number | null
          recording_id?: string | null
          self_rating?: string | null
          spoke?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_log_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      review_state: {
        Row: {
          difficulty: number | null
          due_at: string | null
          item_id: string
          item_type: string
          lapses: number
          last_review: string | null
          reps: number
          stability: number | null
          stage: string
          user_id: string
        }
        Insert: {
          difficulty?: number | null
          due_at?: string | null
          item_id: string
          item_type: string
          lapses?: number
          last_review?: string | null
          reps?: number
          stability?: number | null
          stage?: string
          user_id: string
        }
        Update: {
          difficulty?: number | null
          due_at?: string | null
          item_id?: string
          item_type?: string
          lapses?: number
          last_review?: string | null
          reps?: number
          stability?: number | null
          stage?: string
          user_id?: string
        }
        Relationships: []
      }
      wordforms: {
        Row: {
          created_at: string
          form: string
          freq_count: number | null
          gram_case: string
          id: string
          lemma_id: string
          number: string
          teach_mode: string
        }
        Insert: {
          created_at?: string
          form: string
          freq_count?: number | null
          gram_case: string
          id?: string
          lemma_id: string
          number?: string
          teach_mode?: string
        }
        Update: {
          created_at?: string
          form?: string
          freq_count?: number | null
          gram_case?: string
          id?: string
          lemma_id?: string
          number?: string
          teach_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "wordforms_lemma_id_fkey"
            columns: ["lemma_id"]
            isOneToOne: false
            referencedRelation: "lemmas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      known_lemmas: {
        Row: {
          lemma_id: string | null
          user_id: string | null
        }
        Insert: {
          lemma_id?: string | null
          user_id?: string | null
        }
        Update: {
          lemma_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_coverage: {
        Row: {
          known_count: number | null
          total_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_distractors: {
        Args: { n?: number; target: string }
        Returns: {
          cefr: string | null
          created_at: string
          examples: Json | null
          freq_band: number | null
          freq_count: number | null
          freq_rank: number | null
          gloss_en: string
          id: string
          lemma: string
          media: Json | null
          mnemonic: Json | null
          native_url: string | null
          phonetic_key: string | null
          pos: string | null
          pron: string | null
          qa_status: string
          semantic_field: string | null
          slow_url: string | null
          updated_at: string
          word_class: string
        }[]
        SetofOptions: {
          from: "*"
          to: "lemmas"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
