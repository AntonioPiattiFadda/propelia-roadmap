// GENERADO desde la base (MCP generate_typescript_types, proyecto itqwxnmuxuiiydsueazb). No editar a mano:
// si cambia supabase/schema.sql, se vuelve a generar.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      crm_assignment_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_user_id: string | null
          id: string
          lead_id: string
          to_user_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_user_id?: string | null
          id?: string
          lead_id: string
          to_user_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_user_id?: string | null
          id?: string
          lead_id?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_assignment_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_assignment_history_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_assignment_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_assignment_history_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_channels: {
        Row: {
          allow_delete: boolean
          created_at: string
          deleted_at: string | null
          id: string
          label: string
          position: number
          updated_at: string
        }
        Insert: {
          allow_delete?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          label: string
          position?: number
          updated_at?: string
        }
        Update: {
          allow_delete?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_clients: {
        Row: {
          agents_count: number | null
          alternative_phone_1: string | null
          alternative_phone_1_note: string | null
          alternative_phone_1_notes: string | null
          alternative_phone_1_role: string | null
          alternative_phone_1_source: string | null
          alternative_phone_2: string | null
          alternative_phone_2_note: string | null
          alternative_phone_2_notes: string | null
          alternative_phone_2_role: string | null
          alternative_phone_2_source: string | null
          batch_activated_on: string | null
          company_name: string | null
          contact_notes: string | null
          contact_role: string | null
          city: string | null
          created_at: string
          created_by: string | null
          current_crm: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          google_maps_phone: string | null
          id: string
          idealista_phone: string | null
          idealista_url: string | null
          idealista_listings: number | null
          idealista_years: number | null
          import_batch: string | null
          last_name: string | null
          neighborhood: string | null
          notes: string | null
          office_address: string | null
          phone: string | null
          phone_source: string | null
          sdr_advice: string | null
          selection_reason: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          agents_count?: number | null
          alternative_phone_1?: string | null
          alternative_phone_1_note?: string | null
          alternative_phone_1_notes?: string | null
          alternative_phone_1_role?: string | null
          alternative_phone_1_source?: string | null
          alternative_phone_2?: string | null
          alternative_phone_2_note?: string | null
          alternative_phone_2_notes?: string | null
          alternative_phone_2_role?: string | null
          alternative_phone_2_source?: string | null
          batch_activated_on?: string | null
          company_name?: string | null
          contact_notes?: string | null
          contact_role?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          current_crm?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          google_maps_phone?: string | null
          id?: string
          idealista_phone?: string | null
          idealista_url?: string | null
          idealista_listings?: number | null
          idealista_years?: number | null
          import_batch?: string | null
          last_name?: string | null
          neighborhood?: string | null
          notes?: string | null
          office_address?: string | null
          phone?: string | null
          phone_source?: string | null
          sdr_advice?: string | null
          selection_reason?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          agents_count?: number | null
          alternative_phone_1?: string | null
          alternative_phone_1_note?: string | null
          alternative_phone_1_notes?: string | null
          alternative_phone_1_role?: string | null
          alternative_phone_1_source?: string | null
          alternative_phone_2?: string | null
          alternative_phone_2_note?: string | null
          alternative_phone_2_notes?: string | null
          alternative_phone_2_role?: string | null
          alternative_phone_2_source?: string | null
          batch_activated_on?: string | null
          company_name?: string | null
          contact_notes?: string | null
          contact_role?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          current_crm?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          google_maps_phone?: string | null
          id?: string
          idealista_phone?: string | null
          idealista_url?: string | null
          idealista_listings?: number | null
          idealista_years?: number | null
          import_batch?: string | null
          last_name?: string | null
          neighborhood?: string | null
          notes?: string | null
          office_address?: string | null
          phone?: string | null
          phone_source?: string | null
          sdr_advice?: string | null
          selection_reason?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_comments: {
        Row: {
          comment_type: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          lead_id: string
          long_description: string | null
        }
        Insert: {
          comment_type?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          lead_id: string
          long_description?: string | null
        }
        Update: {
          comment_type?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          lead_id?: string
          long_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_comments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_data_access: {
        Row: {
          access: string
          created_at: string
          id: string
          subject_id: string
          updated_at: string
          viewer_id: string
        }
        Insert: {
          access: string
          created_at?: string
          id?: string
          subject_id: string
          updated_at?: string
          viewer_id: string
        }
        Update: {
          access?: string
          created_at?: string
          id?: string
          subject_id?: string
          updated_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_data_access_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_data_access_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_funnel_stages: {
        Row: {
          allow_delete: boolean
          allow_rename: boolean
          allow_reorder: boolean
          created_at: string
          deleted_at: string | null
          id: string
          is_out_of_funnel: boolean
          label: string
          management_tolerance_hours: number | null
          position: number
          priority_id: string | null
          updated_at: string
          value: string
        }
        Insert: {
          allow_delete?: boolean
          allow_rename?: boolean
          allow_reorder?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_out_of_funnel?: boolean
          label?: string
          management_tolerance_hours?: number | null
          position?: number
          priority_id?: string | null
          updated_at?: string
          value?: string
        }
        Update: {
          allow_delete?: boolean
          allow_rename?: boolean
          allow_reorder?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_out_of_funnel?: boolean
          label?: string
          management_tolerance_hours?: number | null
          position?: number
          priority_id?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_funnel_stages_priority_id_fkey"
            columns: ["priority_id"]
            isOneToOne: false
            referencedRelation: "crm_priorities"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          assigned_to: string
          channel_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          created_via: string
          deleted_at: string | null
          discard_reason: string | null
          funnel_stage_id: string | null
          gestion_has_events: boolean
          gestion_postponed: boolean
          gestion_reference_at: string | null
          id: string
          last_important_event_at: string
          last_opened_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_to: string
          channel_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          created_via?: string
          deleted_at?: string | null
          discard_reason?: string | null
          funnel_stage_id?: string | null
          gestion_has_events?: boolean
          gestion_postponed?: boolean
          gestion_reference_at?: string | null
          id?: string
          last_important_event_at?: string
          last_opened_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          channel_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          created_via?: string
          deleted_at?: string | null
          discard_reason?: string | null
          funnel_stage_id?: string | null
          gestion_has_events?: boolean
          gestion_postponed?: boolean
          gestion_reference_at?: string | null
          id?: string
          last_important_event_at?: string
          last_opened_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "crm_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_funnel_stage_id_fkey"
            columns: ["funnel_stage_id"]
            isOneToOne: false
            referencedRelation: "crm_funnel_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_management_events: {
        Row: {
          action: Database["public"]["Enums"]["crm_management_action"]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          effective_at: string
          id: string
          lead_id: string
          note: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["crm_management_action"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_at?: string
          id?: string
          lead_id: string
          note?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["crm_management_action"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_at?: string
          id?: string
          lead_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_management_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_management_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_meetings: {
        Row: {
          assigned_to: string
          cancel_reason: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          ends_at: string
          id: string
          lead_id: string | null
          starts_at: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          assigned_to: string
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_at: string
          id?: string
          lead_id?: string | null
          starts_at: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          lead_id?: string | null
          starts_at?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_meetings_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_priorities: {
        Row: {
          color: string
          created_at: string
          deleted_at: string | null
          id: string
          management_tolerance_hours: number | null
          name: string
          position: number
          show_in_filters: boolean
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          management_tolerance_hours?: number | null
          name: string
          position?: number
          show_in_filters?: boolean
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          management_tolerance_hours?: number | null
          name?: string
          position?: number
          show_in_filters?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      crm_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_stage_id: string | null
          id: string
          lead_id: string
          to_stage_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_stage_id?: string | null
          id?: string
          lead_id: string
          to_stage_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_stage_id?: string | null
          id?: string
          lead_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "crm_funnel_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "crm_funnel_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assigned_to: string
          completed: boolean
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          planned_for: string | null
          recurrence: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          planned_for?: string | null
          recurrence?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          planned_for?: string | null
          recurrence?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_caja: {
        Row: {
          carga: Json
          categoria: string
          concepto: string
          cuenta: string
          fecha: string | null
          id: string
          monto: number
          notas: string
          orden: number
          origen: string
          repite: string
          updated_at: string
        }
        Insert: {
          carga?: Json
          categoria?: string
          concepto?: string
          cuenta?: string
          fecha?: string | null
          id: string
          monto?: number
          notas?: string
          orden: number
          origen?: string
          repite?: string
          updated_at?: string
        }
        Update: {
          carga?: Json
          categoria?: string
          concepto?: string
          cuenta?: string
          fecha?: string | null
          id?: string
          monto?: number
          notas?: string
          orden?: number
          origen?: string
          repite?: string
          updated_at?: string
        }
        Relationships: []
      }
      roadmap_notas: {
        Row: {
          id: string
          orden: number
          texto: string
          titulo: string
          updated_at: string
        }
        Insert: {
          id: string
          orden: number
          texto?: string
          titulo?: string
          updated_at?: string
        }
        Update: {
          id?: string
          orden?: number
          texto?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      roadmap_tareas: {
        Row: {
          backlog: boolean
          chat: Json
          com: string
          creada: string
          dep: string | null
          estado: string
          expl: string
          fecha: string | null
          files: Json
          hoy: boolean
          id: string
          img: string
          loom: string | null
          modulo: string
          orden: number
          pend: Json
          prioridad: string
          resp: string
          sprint: number | null
          subtareas: Json
          tarea: string
          tipo: string
          updated_at: string
        }
        Insert: {
          backlog?: boolean
          chat?: Json
          com?: string
          creada?: string
          dep?: string | null
          estado?: string
          expl?: string
          fecha?: string | null
          files?: Json
          hoy?: boolean
          id: string
          img?: string
          loom?: string | null
          modulo?: string
          orden: number
          pend?: Json
          prioridad?: string
          resp?: string
          sprint?: number | null
          subtareas?: Json
          tarea?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          backlog?: boolean
          chat?: Json
          com?: string
          creada?: string
          dep?: string | null
          estado?: string
          expl?: string
          fecha?: string | null
          files?: Json
          hoy?: boolean
          id?: string
          img?: string
          loom?: string | null
          modulo?: string
          orden?: number
          pend?: Json
          prioridad?: string
          resp?: string
          sprint?: number | null
          subtareas?: Json
          tarea?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          activo: boolean
          caja: boolean
          color: string
          created_at: string
          email: string
          id: string
          iniciales: string
          nombre: string
          rol: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          caja?: boolean
          color: string
          created_at?: string
          email: string
          id: string
          iniciales: string
          nombre: string
          rol?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          caja?: boolean
          color?: string
          created_at?: string
          email?: string
          id?: string
          iniciales?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      crm_create_lead_with_client: {
        Args: {
          p_assigned_to: string
          p_channel_id?: string
          p_company_name?: string
          p_email?: string
          p_first_name?: string
          p_funnel_stage_id?: string
          p_initial_task_due_date: string
          p_last_name?: string
          p_phone?: string
        }
        Returns: Json
      }
      crm_es_superadmin: { Args: never; Returns: boolean }
      crm_gestion_refresh: { Args: { p_lead_id: string }; Returns: undefined }
      crm_puede: {
        Args: { p_nivel: string; p_owner: string }
        Returns: boolean
      }
      crm_puede_cliente: {
        Args: { p_client_id: string; p_nivel: string }
        Returns: boolean
      }
      crm_puede_lead: {
        Args: { p_lead_id: string; p_nivel: string }
        Returns: boolean
      }
      es_usuario: { Args: never; Returns: boolean }
    }
    Enums: {
      crm_management_action: "MANUAL" | "POSTPONED"
      user_role: "SUPERADMIN" | "SDR"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      crm_management_action: ["MANUAL", "POSTPONED"],
      user_role: ["SUPERADMIN", "SDR"],
    },
  },
} as const
