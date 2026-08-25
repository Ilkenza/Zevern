export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {

  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          business_type: string | null
          contact: string | null
          contact_channel: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          region: string | null
          tier: string | null
          user_id: string
        }
        Insert: {
          business_type?: string | null
          contact?: string | null
          contact_channel?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          region?: string | null
          tier?: string | null
          user_id?: string
        }
        Update: {
          business_type?: string | null
          contact?: string | null
          contact_channel?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          region?: string | null
          tier?: string | null
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          currency: string
          due_date: string | null
          id: string
          issued_at: string | null
          items: Json
          number: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount?: number
          client_id?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          issued_at?: string | null
          items?: Json
          number?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          issued_at?: string | null
          items?: Json
          number?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          channel: string | null
          client_id: string | null
          company: string | null
          contact: string | null
          created_at: string
          id: string
          last_contact_at: string | null
          name: string
          next_followup: string | null
          notes: string | null
          service: string | null
          status: string
          user_id: string
          value: number
        }
        Insert: {
          channel?: string | null
          client_id?: string | null
          company?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          last_contact_at?: string | null
          name: string
          next_followup?: string | null
          notes?: string | null
          service?: string | null
          status?: string
          user_id?: string
          value?: number
        }
        Update: {
          channel?: string | null
          client_id?: string | null
          company?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          last_contact_at?: string | null
          name?: string
          next_followup?: string | null
          notes?: string | null
          service?: string | null
          status?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          title: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      money_accounts: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string
          currency: string
          id: string
          is_default: boolean
          kind: string
          name: string
          opening_balance: number
          sort: number
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_default?: boolean
          kind?: string
          name: string
          opening_balance?: number
          sort?: number
          user_id?: string
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          opening_balance?: number
          sort?: number
          user_id?: string
        }
        Relationships: []
      }
      money_budgets: {
        Row: {
          amount_rsd: number
          category_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          amount_rsd?: number
          category_id: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Update: {
          amount_rsd?: number
          category_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "money_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      money_categories: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string
          icon: string | null
          id: string
          kind: string
          name: string
          sort: number
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          name: string
          sort?: number
          user_id?: string
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          name?: string
          sort?: number
          user_id?: string
        }
        Relationships: []
      }
      money_goals: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string
          completed_at: string | null
          sort: number
          id: string
          name: string
          target_date: string | null
          currency: string
          rate: number
          target_amount: number | null
          target_rsd: number
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string
          completed_at?: string | null
          sort?: number
          id?: string
          name: string
          target_date?: string | null
          currency?: string
          rate?: number
          target_amount?: number | null
          target_rsd?: number
          user_id?: string
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string
          completed_at?: string | null
          sort?: number
          id?: string
          name?: string
          target_date?: string | null
          currency?: string
          rate?: number
          target_amount?: number | null
          target_rsd?: number
          user_id?: string
        }
        Relationships: []
      }
      money_planned: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          due_on: string
          id: string
          kind: string
          name: string
          note: string | null
          settled_at: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          due_on?: string
          id?: string
          kind?: string
          name: string
          note?: string | null
          settled_at?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          due_on?: string
          id?: string
          kind?: string
          name?: string
          note?: string | null
          settled_at?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_planned_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_planned_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "money_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_planned_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "money_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      money_recurring: {
        Row: {
          account_id: string | null
          active: boolean
          amount: number
          anchor_day: number | null
          category_id: string | null
          created_at: string
          currency: string
          display_currency: string | null
          ends_on: string | null
          every: string
          goal_id: string | null
          id: string
          installments_done: number
          installments_total: number | null
          kind: string
          name: string
          next_on: string
          user_id: string
          variable: boolean
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          amount?: number
          anchor_day?: number | null
          category_id?: string | null
          created_at?: string
          currency?: string
          display_currency?: string | null
          ends_on?: string | null
          every?: string
          goal_id?: string | null
          id?: string
          installments_done?: number
          installments_total?: number | null
          kind?: string
          name: string
          next_on?: string
          user_id?: string
          variable?: boolean
        }
        Update: {
          account_id?: string | null
          active?: boolean
          amount?: number
          anchor_day?: number | null
          category_id?: string | null
          created_at?: string
          currency?: string
          display_currency?: string | null
          ends_on?: string | null
          every?: string
          goal_id?: string | null
          id?: string
          installments_done?: number
          installments_total?: number | null
          kind?: string
          name?: string
          next_on?: string
          user_id?: string
          variable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "money_recurring_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_recurring_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "money_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      money_transactions: {
        Row: {
          account_id: string | null
          amount: number
          amount_rsd: number
          category_id: string | null
          created_at: string
          currency: string
          goal_id: string | null
          id: string
          kind: string
          note: string | null
          occurred_on: string
          rate: number
          title: string | null
          recurring_id: string | null
          to_account_id: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string
          currency?: string
          goal_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          occurred_on?: string
          rate?: number
          title?: string | null
          recurring_id?: string | null
          to_account_id?: string | null
          user_id?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          goal_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          occurred_on?: string
          rate?: number
          title?: string | null
          recurring_id?: string | null
          to_account_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "money_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_transactions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "money_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_transactions_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "money_recurring"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_transactions_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "money_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          business_address: string | null
          business_email: string | null
          business_name: string | null
          created_at: string
          calendar_token: string | null
          custom_colors: string[]
          ext_token_hash: string | null
          onboarding_hidden: boolean
          full_name: string | null
          spending_basis: string
          handle: string | null
          hidden_modules: string[]
          default_currency: string
          id: string
          rate_eur: number
          rate_usd: number
          rates_updated_on: string | null
          revenue_goal: number
          vat_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string | null
          created_at?: string
          calendar_token?: string | null
          custom_colors?: string[]
          ext_token_hash?: string | null
          onboarding_hidden?: boolean
          full_name?: string | null
          spending_basis?: string
          handle?: string | null
          hidden_modules?: string[]
          id: string
          rate_eur?: number
          rate_usd?: number
          rates_updated_on?: string | null
          revenue_goal?: number
          vat_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string | null
          created_at?: string
          calendar_token?: string | null
          custom_colors?: string[]
          ext_token_hash?: string | null
          onboarding_hidden?: boolean
          full_name?: string | null
          spending_basis?: string
          handle?: string | null
          hidden_modules?: string[]
          default_currency?: string
          id?: string
          rate_eur?: number
          rate_usd?: number
          rates_updated_on?: string | null
          revenue_goal?: number
          vat_id?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          client_id: string | null
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          id: string
          status: string
          title: string
          user_id: string
          value: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string
          title: string
          user_id?: string
          value?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string
          title?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_id: string | null
          created_at: string
          currency: string
          id: string
          invoice_id: string | null
          items: Json
          status: string
          title: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          items?: Json
          status?: string
          title: string
          user_id?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          items?: Json
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_checks: {
        Row: {
          created_at: string
          id: string
          project_id: string | null
          results: Json
          score: number
          title: string | null
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id?: string | null
          results?: Json
          score?: number
          title?: string | null
          url: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string | null
          results?: Json
          score?: number
          title?: string | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_checks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      service_items: {
        Row: {
          category: string | null
          created_at: string
          currency: string
          id: string
          label: string
          price: number
          price_eur: number | null
          price_rsd: number | null
          price_usd: number | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string
          id?: string
          label: string
          price?: number
          price_eur?: number | null
          price_rsd?: number | null
          price_usd?: number | null
          user_id?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string
          id?: string
          label?: string
          price?: number
          price_eur?: number | null
          price_rsd?: number | null
          price_usd?: number | null
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          created_at: string
          due_at: string | null
          id: string
          priority: string
          project_id: string | null
          status: string
          title: string
          user_id: string
          workspace: string
        }
        Insert: {
          created_at?: string
          due_at?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          status?: string
          title: string
          user_id?: string
          workspace?: string
        }
        Update: {
          created_at?: string
          due_at?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          status?: string
          title?: string
          user_id?: string
          workspace?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          category: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          url?: string | null
          user_id?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
