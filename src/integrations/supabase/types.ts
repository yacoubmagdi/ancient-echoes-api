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
      admin_otp_codes: {
        Row: {
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          used: boolean
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          used?: boolean
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      admin_otp_requests: {
        Row: {
          created_at: string
          id: string
          ip_hash: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nationality_categories: {
        Row: {
          categories: string[]
          nationality_code: string
        }
        Insert: {
          categories: string[]
          nationality_code: string
        }
        Update: {
          categories?: string[]
          nationality_code?: string
        }
        Relationships: []
      }
      persona_audit_log: {
        Row: {
          changed_by: string | null
          changed_field: string
          created_at: string
          id: string
          new_value: string | null
          old_value: string | null
          persona_id: string
          persona_name: string
        }
        Insert: {
          changed_by?: string | null
          changed_field: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          persona_id: string
          persona_name: string
        }
        Update: {
          changed_by?: string | null
          changed_field?: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          persona_id?: string
          persona_name?: string
        }
        Relationships: []
      }
      persona_deletion_log: {
        Row: {
          category: string
          deleted_at: string
          deleted_by: string | null
          description: string | null
          gender: string | null
          id: string
          image_url: string | null
          persona_id: string
          persona_name: string
          role: string | null
          source_image_url: string | null
        }
        Insert: {
          category: string
          deleted_at?: string
          deleted_by?: string | null
          description?: string | null
          gender?: string | null
          id?: string
          image_url?: string | null
          persona_id: string
          persona_name: string
          role?: string | null
          source_image_url?: string | null
        }
        Update: {
          category?: string
          deleted_at?: string
          deleted_by?: string | null
          description?: string | null
          gender?: string | null
          id?: string
          image_url?: string | null
          persona_id?: string
          persona_name?: string
          role?: string | null
          source_image_url?: string | null
        }
        Relationships: []
      }
      persona_verification_log: {
        Row: {
          category: string
          confidence: number | null
          created_at: string
          gender: string | null
          id: string
          persona_name: string
          reason: string
          role: string | null
          sources: string[] | null
          verdict: string
          verified_by: string | null
        }
        Insert: {
          category: string
          confidence?: number | null
          created_at?: string
          gender?: string | null
          id?: string
          persona_name: string
          reason: string
          role?: string | null
          sources?: string[] | null
          verdict: string
          verified_by?: string | null
        }
        Update: {
          category?: string
          confidence?: number | null
          created_at?: string
          gender?: string | null
          id?: string
          persona_name?: string
          reason?: string
          role?: string | null
          sources?: string[] | null
          verdict?: string
          verified_by?: string | null
        }
        Relationships: []
      }
      personas: {
        Row: {
          category: string
          created_at: string
          description: string
          description_audit: Json | null
          description_en: string | null
          duplicate_flag: Json | null
          face_descriptor: Json | null
          gender: string
          id: string
          image_url: string
          is_drawing: boolean
          name: string
          name_en: string | null
          role: string
          skin_tone: Json | null
          source_image_url: string | null
          verification_status: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          description_audit?: Json | null
          description_en?: string | null
          duplicate_flag?: Json | null
          face_descriptor?: Json | null
          gender?: string
          id?: string
          image_url: string
          is_drawing?: boolean
          name: string
          name_en?: string | null
          role?: string
          skin_tone?: Json | null
          source_image_url?: string | null
          verification_status?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          description_audit?: Json | null
          description_en?: string | null
          duplicate_flag?: Json | null
          face_descriptor?: Json | null
          gender?: string
          id?: string
          image_url?: string
          is_drawing?: boolean
          name?: string
          name_en?: string | null
          role?: string
          skin_tone?: Json | null
          source_image_url?: string | null
          verification_status?: string | null
        }
        Relationships: []
      }
      query_logs: {
        Row: {
          created_at: string
          error_code: string | null
          id: string
          ip_hash: string | null
          matched_persona_id: string | null
          similarity: number | null
          success: boolean
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          id?: string
          ip_hash?: string | null
          matched_persona_id?: string | null
          similarity?: number | null
          success?: boolean
        }
        Update: {
          created_at?: string
          error_code?: string | null
          id?: string
          ip_hash?: string | null
          matched_persona_id?: string | null
          similarity?: number | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "query_logs_matched_persona_id_fkey"
            columns: ["matched_persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_results: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          match_image_url: string
          match_name: string
          similarity: number
          user_image_data: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          match_image_url: string
          match_name: string
          similarity: number
          user_image_data?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          match_image_url?: string
          match_name?: string
          similarity?: number
          user_image_data?: string | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      source_url_check_logs: {
        Row: {
          batch_id: string
          checked_at: string
          error_message: string | null
          id: string
          is_ok: boolean
          persona_id: string
          persona_name: string
          source_url: string
          status_code: number | null
        }
        Insert: {
          batch_id: string
          checked_at?: string
          error_message?: string | null
          id?: string
          is_ok?: boolean
          persona_id: string
          persona_name: string
          source_url: string
          status_code?: number | null
        }
        Update: {
          batch_id?: string
          checked_at?: string
          error_message?: string | null
          id?: string
          is_ok?: boolean
          persona_id?: string
          persona_name?: string
          source_url?: string
          status_code?: number | null
        }
        Relationships: []
      }
      user_messages: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_read: boolean
          message: string
          name: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_read?: boolean
          message: string
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_read?: boolean
          message?: string
          name?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_first_admin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
