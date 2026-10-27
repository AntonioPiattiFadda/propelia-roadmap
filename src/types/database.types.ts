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
      calendar_connections: {
        Row: {
          access_token: string | null
          calendar_id: string
          connected_email: string | null
          created_at: string
          id: string
          provider: string
          refresh_token: string
          status: string
          sync_token: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
          watch_channel_id: string | null
          watch_expires_at: string | null
          watch_resource_id: string | null
          watch_token: string | null
        }
        Insert: {
          access_token?: string | null
          calendar_id?: string
          connected_email?: string | null
          created_at?: string
          id?: string
          provider: string
          refresh_token: string
          status?: string
          sync_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          watch_channel_id?: string | null
          watch_expires_at?: string | null
          watch_resource_id?: string | null
          watch_token?: string | null
        }
        Update: {
          access_token?: string | null
          calendar_id?: string
          connected_email?: string | null
          created_at?: string
          id?: string
          provider?: string
          refresh_token?: string
          status?: string
          sync_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          watch_channel_id?: string | null
          watch_expires_at?: string | null
          watch_resource_id?: string | null
          watch_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding_members: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          id: string
          is_contact: boolean
          is_owner: boolean
          last_name: string
          onboarding_id: string
          phone: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          is_contact?: boolean
          is_owner?: boolean
          last_name?: string
          onboarding_id: string
          phone?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          is_contact?: boolean
          is_owner?: boolean
          last_name?: string
          onboarding_id?: string
          phone?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_members_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "client_onboardings"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding_tasks: {
        Row: {
          done_at: string
          done_by: string | null
          onboarding_id: string
          task_id: string
        }
        Insert: {
          done_at?: string
          done_by?: string | null
          onboarding_id: string
          task_id: string
        }
        Update: {
          done_at?: string
          done_by?: string | null
          onboarding_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_tasks_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "client_onboardings"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboardings: {
        Row: {
          assigned_to: string | null
          company_name: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          public_token: string
          submitted_at: string | null
          website: string | null
        }
        Insert: {
          assigned_to?: string | null
          company_name?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          public_token?: string
          submitted_at?: string | null
          website?: string | null
        }
        Update: {
          assigned_to?: string | null
          company_name?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          public_token?: string
          submitted_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_onboardings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
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
          alternative_phone_1_email: string | null
          alternative_phone_1_note: string | null
          alternative_phone_1_notes: string | null
          alternative_phone_1_role: string | null
          alternative_phone_1_source: string | null
          alternative_phone_2: string | null
          alternative_phone_2_email: string | null
          alternative_phone_2_note: string | null
          alternative_phone_2_notes: string | null
          alternative_phone_2_role: string | null
          alternative_phone_2_source: string | null
          batch_activated_on: string | null
          company_name: string | null
          alternative_phone_1_is_decision_maker: boolean | null
          alternative_phone_2_is_decision_maker: boolean | null
          contact_is_decision_maker: boolean | null
          contact_notes: string | null
          contact_role: string | null
          city: string | null
          created_at: string
          created_by: string | null
          current_crm: string | null
          current_crm_id: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          google_maps_phone: string | null
          google_maps_url: string | null
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
          alternative_phone_1_email?: string | null
          alternative_phone_1_note?: string | null
          alternative_phone_1_notes?: string | null
          alternative_phone_1_role?: string | null
          alternative_phone_1_source?: string | null
          alternative_phone_2?: string | null
          alternative_phone_2_email?: string | null
          alternative_phone_2_note?: string | null
          alternative_phone_2_notes?: string | null
          alternative_phone_2_role?: string | null
          alternative_phone_2_source?: string | null
          batch_activated_on?: string | null
          company_name?: string | null
          alternative_phone_1_is_decision_maker?: boolean | null
          alternative_phone_2_is_decision_maker?: boolean | null
          contact_is_decision_maker?: boolean | null
          contact_notes?: string | null
          contact_role?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          current_crm?: string | null
          current_crm_id?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          google_maps_phone?: string | null
          google_maps_url?: string | null
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
          alternative_phone_1_email?: string | null
          alternative_phone_1_note?: string | null
          alternative_phone_1_notes?: string | null
          alternative_phone_1_role?: string | null
          alternative_phone_1_source?: string | null
          alternative_phone_2?: string | null
          alternative_phone_2_email?: string | null
          alternative_phone_2_note?: string | null
          alternative_phone_2_notes?: string | null
          alternative_phone_2_role?: string | null
          alternative_phone_2_source?: string | null
          batch_activated_on?: string | null
          company_name?: string | null
          alternative_phone_1_is_decision_maker?: boolean | null
          alternative_phone_2_is_decision_maker?: boolean | null
          contact_is_decision_maker?: boolean | null
          contact_notes?: string | null
          contact_role?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          current_crm?: string | null
          current_crm_id?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          google_maps_phone?: string | null
          google_maps_url?: string | null
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
      crm_email_plantillas: {
        Row: {
          campos: Json
          plantilla: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          campos?: Json
          plantilla: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          campos?: Json
          plantilla?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      crm_emails: {
        Row: {
          id: string
          lead_id: string | null
          plantilla: string | null
          resend_id: string
          seen_at: string | null
          seen_by: string | null
          sent_at: string
          sent_by: string
          status: string
          status_at: string | null
          status_detail: string | null
          subject: string
          to_email: string
        }
        Insert: {
          id?: string
          lead_id?: string | null
          plantilla?: string | null
          resend_id: string
          seen_at?: string | null
          seen_by?: string | null
          sent_at?: string
          sent_by: string
          status?: string
          status_at?: string | null
          status_detail?: string | null
          subject?: string
          to_email: string
        }
        Update: {
          id?: string
          lead_id?: string | null
          plantilla?: string | null
          resend_id?: string
          seen_at?: string | null
          seen_by?: string | null
          sent_at?: string
          sent_by?: string
          status?: string
          status_at?: string | null
          status_detail?: string | null
          subject?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_emails_seen_by_fkey"
            columns: ["seen_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_emails_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_emails_sent_by_fkey"
            columns: ["sent_by"]
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
          allows_tasks: boolean
          created_at: string
          deleted_at: string | null
          id: string
          is_out_of_funnel: boolean
          label: string
          management_tolerance_hours: number | null
          management_type: string | null
          position: number
          priority_id: string | null
          show_in_dashboard: boolean
          starts_onboarding: boolean
          updated_at: string
          value: string
        }
        Insert: {
          allow_delete?: boolean
          allow_rename?: boolean
          allow_reorder?: boolean
          allows_tasks?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_out_of_funnel?: boolean
          label?: string
          management_tolerance_hours?: number | null
          management_type?: string | null
          position?: number
          priority_id?: string | null
          show_in_dashboard?: boolean
          starts_onboarding?: boolean
          updated_at?: string
          value?: string
        }
        Update: {
          allow_delete?: boolean
          allow_rename?: boolean
          allow_reorder?: boolean
          allows_tasks?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_out_of_funnel?: boolean
          label?: string
          management_tolerance_hours?: number | null
          management_type?: string | null
          position?: number
          priority_id?: string | null
          show_in_dashboard?: boolean
          starts_onboarding?: boolean
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
          importante: boolean
          last_important_event_at: string
          lead_type: Database["public"]["Enums"]["crm_lead_type"]
          last_opened_at: string | null
          propelia_organization_id: string | null
          recontact_at: string | null
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
          importante?: boolean
          last_important_event_at?: string
          lead_type?: Database["public"]["Enums"]["crm_lead_type"]
          last_opened_at?: string | null
          propelia_organization_id?: string | null
          recontact_at?: string | null
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
          importante?: boolean
          last_important_event_at?: string
          lead_type?: Database["public"]["Enums"]["crm_lead_type"]
          last_opened_at?: string | null
          propelia_organization_id?: string | null
          recontact_at?: string | null
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
          color_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          ends_at: string
          external_event_id: string | null
          external_provider: string | null
          guest_emails: string[]
          guest_user_ids: string[]
          ics_sequence: number
          id: string
          lead_id: string | null
          reminder_minutes: number | null
          starts_at: string
          status: string
          sync_attempts: number
          sync_error: string | null
          sync_status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          assigned_to: string
          cancel_reason?: string | null
          color_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_at: string
          external_event_id?: string | null
          external_provider?: string | null
          guest_emails?: string[]
          guest_user_ids?: string[]
          ics_sequence?: number
          id?: string
          lead_id?: string | null
          reminder_minutes?: number | null
          starts_at: string
          status?: string
          sync_attempts?: number
          sync_error?: string | null
          sync_status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          cancel_reason?: string | null
          color_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_at?: string
          external_event_id?: string | null
          external_provider?: string | null
          guest_emails?: string[]
          guest_user_ids?: string[]
          ics_sequence?: number
          id?: string
          lead_id?: string | null
          reminder_minutes?: number | null
          starts_at?: string
          status?: string
          sync_attempts?: number
          sync_error?: string | null
          sync_status?: string
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
      crm_software: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          label: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string
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
          due_time: string | null
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
          due_time?: string | null
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
          due_time?: string | null
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
      expense_presets: {
        Row: {
          created_at: string
          default_amount: number | null
          deleted_at: string | null
          due_day: number | null
          expense_type: string
          id: string
          name: string
          recurrence: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_amount?: number | null
          deleted_at?: string | null
          due_day?: number | null
          expense_type: string
          id?: string
          name: string
          recurrence?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_amount?: number | null
          deleted_at?: string | null
          due_day?: number | null
          expense_type?: string
          id?: string
          name?: string
          recurrence?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          date: string | null
          deleted_at: string | null
          expense_name: string
          expense_type: string
          id: string
          notes: string | null
          paid_by: string | null
          period: string
          preset_id: string | null
          recurrence: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          expense_name: string
          expense_type: string
          id?: string
          notes?: string | null
          paid_by?: string | null
          period: string
          preset_id?: string | null
          recurrence?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          expense_name?: string
          expense_type?: string
          id?: string
          notes?: string | null
          paid_by?: string | null
          period?: string
          preset_id?: string | null
          recurrence?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "expense_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notification_deliveries: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          event_id: string
          id: string
          provider_message_id: string | null
          recipient: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          event_id: string
          id?: string
          provider_message_id?: string | null
          recipient?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          event_id?: string
          id?: string
          provider_message_id?: string | null
          recipient?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notification_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "lead_notification_events"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notification_events: {
        Row: {
          actor_user_id: string
          attempts: number
          created_at: string
          dedupe_key: string
          id: string
          last_error: string | null
          locked_at: string | null
          next_attempt_at: string
          payload: Json
          processed_at: string | null
          status: string
          subject_id: string
          type: string
        }
        Insert: {
          actor_user_id: string
          attempts?: number
          created_at?: string
          dedupe_key?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          subject_id: string
          type: string
        }
        Update: {
          actor_user_id?: string
          attempts?: number
          created_at?: string
          dedupe_key?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          subject_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notification_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notification_preferences: {
        Row: {
          channel: string
          enabled: boolean
          event_type: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          channel: string
          enabled?: boolean
          event_type: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          channel?: string
          enabled?: boolean
          event_type?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_notification_preferences_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_state_nonces: {
        Row: {
          nonce: string
          used_at: string
        }
        Insert: {
          nonce: string
          used_at?: string
        }
        Update: {
          nonce?: string
          used_at?: string
        }
        Relationships: []
      }
      onboarding_message_templates: {
        Row: {
          body: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
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
          firma_cargo: string | null
          firma_email: string | null
          firma_nombre: string | null
          firma_telefono: string | null
          id: string
          iniciales: string
          last_meeting_color_id: string | null
          last_name: string | null
          nombre: string
          rol: Database["public"]["Enums"]["user_role"]
          phone: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          caja?: boolean
          color: string
          created_at?: string
          email: string
          firma_cargo?: string | null
          firma_email?: string | null
          firma_nombre?: string | null
          firma_telefono?: string | null
          id: string
          iniciales: string
          last_meeting_color_id?: string | null
          last_name?: string | null
          nombre: string
          rol?: Database["public"]["Enums"]["user_role"]
          phone?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          caja?: boolean
          color?: string
          created_at?: string
          email?: string
          firma_cargo?: string | null
          firma_email?: string | null
          firma_nombre?: string | null
          firma_telefono?: string | null
          id?: string
          iniciales?: string
          last_meeting_color_id?: string | null
          last_name?: string | null
          nombre?: string
          rol?: Database["public"]["Enums"]["user_role"]
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      client_onboarding_completar: {
        Args: { p_onboarding_id: string }
        Returns: undefined
      }
      client_onboarding_importar_equipo: {
        Args: { p_miembros: Json; p_onboarding_id: string; p_organization_id: string }
        Returns: undefined
      }
      onboarding_alta_enviar: {
        Args: { p_company_name: string; p_miembros: Json; p_token: string; p_website: string }
        Returns: undefined
      }
      onboarding_alta_leer: { Args: { p_token: string }; Returns: Json }
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
      crm_set_member_last_name: {
        Args: { p_last_name: string; p_user_id: string }
        Returns: undefined
      }
      crm_email_evento: {
        Args: { p_at: string; p_detalle: string; p_resend_id: string; p_status: string }
        Returns: boolean
      }
      crm_email_visto: { Args: { p_id: string; p_visto?: boolean }; Returns: undefined }
      claim_lead_notification_events: {
        Args: { p_limit: number }
        Returns: Database["public"]["Tables"]["lead_notification_events"]["Row"][]
      }
      crm_set_last_meeting_color: { Args: { p_color_id: string | null }; Returns: undefined }
      crm_set_member_phone: {
        Args: { p_phone: string; p_user_id: string }
        Returns: undefined
      }
      crm_dar_de_baja_miembro: {
        Args: { p_simular?: boolean; p_sucesor?: string; p_user_id: string }
        Returns: Json
      }
      crm_es_superadmin: { Args: never; Returns: boolean }
      crm_gestion_refresh: { Args: { p_lead_id: string }; Returns: undefined }
      crm_importar_lote: {
        Args: { p_assigned_to: string; p_filas: Json; p_simular?: boolean }
        Returns: Json
      }
      crm_lineas_de_seccion: {
        Args: { p_texto: string; p_titulo: string }
        Returns: string[]
      }
      crm_normalizar: { Args: { p: string }; Returns: string }
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
      crm_telefonos: { Args: { p: string }; Returns: string[] }
      crm_url_clave: { Args: { p: string }; Returns: string }
      es_usuario: { Args: never; Returns: boolean }
    }
    Enums: {
      crm_lead_type: "LEAD" | "ONBOARDING" | "CLIENT"
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
