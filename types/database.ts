// Tipos escritos a mano siguiendo el formato de `supabase gen types`.
// En cuanto tengas el proyecto creado, sustitúyelos por los generados:
//   npx supabase gen types typescript --project-id <id> > types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      access_logs: {
        Row: { id: number; event_id: string; ticket_id: string | null; admin_id: string | null; attempted_code: string | null; result: string; created_at: string }
        Insert: never
        Update: never
        Relationships: [{ foreignKeyName: 'access_logs_ticket_id_fkey'; columns: ['ticket_id']; isOneToOne: false; referencedRelation: 'tickets'; referencedColumns: ['id'] }]
      }
      // Solo lectura (RLS: quien gestiona el grupo); se escribe mediante funciones.
      invitations: {
        Row: { id: string; organization_id: string; email: string; role: 'organizer' | 'controller'; event_id: string | null; invited_by: string | null; created_at: string; expires_at: string; accepted_at: string | null; accepted_by: string | null }
        Insert: never
        Update: never
        Relationships: []
      }
      // Solo lectura desde la app (RLS: quien gestiona el evento); se escribe mediante funciones.
      reservations: {
        Row: {
          id: string
          event_id: string
          ticket_type_id: string
          code: string
          first_name: string
          last_name: string
          email: string
          phone: string
          quantity: number
          delivered_quantity: number
          unit_price: number
          amount_paid: number
          status: 'pending_pickup' | 'partially_picked_up' | 'completed' | 'cancelled' | 'expired'
          source: 'public' | 'manual'
          notes: string
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      organizations: {
        Row: { id: string; name: string }
        Insert: { id?: string; name: string }
        Update: { name?: string }
        Relationships: []
      }
      organization_members: {
        Row: { user_id: string; organization_id: string; role: 'organizer' | 'controller' }
        Insert: { user_id: string; organization_id: string; role: 'organizer' | 'controller' }
        Update: { role?: 'organizer' | 'controller' }
        Relationships: []
      }
      event_staff: {
        Row: { user_id: string; event_id: string }
        Insert: { user_id: string; event_id: string }
        Update: { event_id?: string }
        Relationships: []
      }

      admins: {
        Row: { user_id: string; created_at: string }
        Insert: { user_id: string; created_at?: string }
        Update: { user_id?: string; created_at?: string }
        Relationships: []
      }
      ticket_templates: {
        Row: {
          organization_id: string | null
          id: string
          name: string
          design: Json
          description_template: string
          created_at: string
          updated_at: string
        }
        Insert: {
          organization_id?: string | null
          id?: string
          name: string
          design?: Json
          description_template?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          organization_id?: string | null
          id?: string
          name?: string
          design?: Json
          description_template?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: EventRegistrationOptions & {
          capacity: number | null
          organization_id: string | null
          id: string
          slug: string
          title: string
          description: string
          venue: string
          starts_at: string
          ends_at: string | null
          cover_url: string | null
          latitude: number | null
          longitude: number | null
          published: boolean
          created_at: string
          updated_at: string
        }
        Insert: EventRegistrationOptions & {
          capacity?: number | null
          organization_id?: string | null
          id?: string
          slug: string
          title: string
          description?: string
          venue?: string
          starts_at: string
          ends_at?: string | null
          cover_url?: string | null
          latitude?: number | null
          longitude?: number | null
          published?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: EventRegistrationOptions & {
          capacity?: number | null
          organization_id?: string | null
          id?: string
          slug?: string
          title?: string
          description?: string
          venue?: string
          starts_at?: string
          ends_at?: string | null
          cover_url?: string | null
          latitude?: number | null
          longitude?: number | null
          published?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_types: {
        Row: {
          id: string
          event_id: string
          name: string
          description: string
          price: number
          capacity: number | null
          max_per_order: number
          template_id: string | null
          sales_open: boolean
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          name: string
          description?: string
          price?: number
          capacity?: number | null
          max_per_order?: number
          template_id?: string | null
          sales_open?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          name?: string
          description?: string
          price?: number
          capacity?: number | null
          max_per_order?: number
          template_id?: string | null
          sales_open?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_types_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_types_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'ticket_templates'
            referencedColumns: ['id']
          },
        ]
      }
      orders: {
        Row: {
          id: string
          event_id: string
          buyer_name: string
          buyer_email: string
          access_token: string
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          buyer_name: string
          buyer_email: string
          access_token?: string
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          buyer_name?: string
          buyer_email?: string
          access_token?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'orders_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
        ]
      }
      tickets: {
        Row: {
          short_code?: string
          registration_id?: string | null
          id: string
          code: string
          order_id: string
          event_id: string
          ticket_type_id: string
          attendee_name: string
          status: Database['public']['Enums']['ticket_status']
          used_at: string | null
          validated_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          code?: string
          order_id: string
          event_id: string
          ticket_type_id: string
          attendee_name: string
          status?: Database['public']['Enums']['ticket_status']
          used_at?: string | null
          validated_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          order_id?: string
          event_id?: string
          ticket_type_id?: string
          attendee_name?: string
          status?: Database['public']['Enums']['ticket_status']
          used_at?: string | null
          validated_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tickets_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tickets_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tickets_ticket_type_id_fkey'
            columns: ['ticket_type_id']
            isOneToOne: false
            referencedRelation: 'ticket_types'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      global_dashboard: { Args: never; Returns: Json }
      redact_registration: { Args: { p_registration: string }; Returns: undefined }
      reserve_bonocopas: { Args: { p_event: string; p_type: string; p_quantity: number; p_first: string; p_last: string; p_email: string; p_phone?: string; p_consent?: boolean; p_manual?: boolean; p_notes?: string; p_attendees?: Json }; Returns: Json }
      get_reservation: { Args: { p_token: string }; Returns: Json }
      lookup_reservation: { Args: { p_event: string; p_credential: string }; Returns: Json }
      record_pickup: { Args: { p_event: string; p_credential: string; p_quantity: number; p_method: string; p_payment_confirmed: boolean; p_identity_checked?: boolean }; Returns: Json }
      cancel_reservation: { Args: { p_reservation: string }; Returns: Json }
      reservation_stats: { Args: { p_event: string }; Returns: Json }
      list_reservations: { Args: { p_event: string; p_query?: string; p_status?: string; p_type?: string; p_page?: number; p_size?: number; p_ascending?: boolean }; Returns: Json }
      reservation_detail: { Args: { p_reservation: string }; Returns: Json }
      rotate_reservation_link: { Args: { p_reservation: string }; Returns: string }
      list_reservation_people: { Args: { p_event: string; p_query?: string; p_status?: string; p_type?: string; p_page?: number; p_size?: number; p_ascending?: boolean }; Returns: Json }
      redact_reservation: { Args: { p_reservation: string }; Returns: Json }
      purge_event_personal_data: { Args: { p_event: string }; Returns: Json }
      assign_staff: { Args: { p_user: string; p_org: string; p_role: string; p_event?: string; p_remove?: boolean }; Returns: undefined }
      register_attendee: { Args: { p_event: string; p_type: string; p_first: string; p_last: string; p_email: string; p_phone: string; p_consent: boolean; p_manual?: boolean; p_approve?: boolean; p_notes?: string }; Returns: Json }
      manage_registration: { Args: { p_registration: string; p_operation: string }; Returns: Json }
      edit_attendee: { Args: { p_registration: string; p_first: string; p_last: string; p_email: string; p_phone: string; p_notes: string }; Returns: undefined }
      ticket_link: { Args: { p_ticket: string; p_revoke?: boolean }; Returns: string | null }
      get_entry: { Args: { p_token: string }; Returns: Json }
      lookup_entry: { Args: { p_event: string; p_code: string; p_confirm?: boolean }; Returns: Json }
      event_dashboard: { Args: { p_event: string }; Returns: Json }
      queue_status: { Args: { p_event: string; p_token?: string }; Returns: Json }
      reserve_with_pass: { Args: { p_pass: string; p_event: string; p_type: string; p_quantity: number; p_first: string; p_last: string; p_email: string; p_phone?: string; p_consent?: boolean; p_attendees?: Json }; Returns: Json }
      event_history: { Args: { p_event: string; p_page?: number; p_size?: number }; Returns: Json }
      create_invitation: { Args: { p_email: string; p_role: string; p_org?: string; p_event?: string }; Returns: Json }
      revoke_invitation: { Args: { p_invitation: string }; Returns: undefined }
      get_invitation: { Args: { p_token: string }; Returns: Json }
      accept_invitation: { Args: { p_token: string }; Returns: undefined }
      list_team: { Args: never; Returns: Json }
      delete_account: { Args: { p_user: string }; Returns: Json }
      own_account_summary: { Args: never; Returns: Json }
      delete_own_account: { Args: never; Returns: Json }
      list_attendees: { Args: { p_event: string; p_query?: string; p_status?: string; p_type?: string; p_page?: number; p_size?: number; p_ascending?: boolean }; Returns: Json }
      staff_role: { Args: never; Returns: 'admin' | 'organizer' | 'controller' | null }
      current_organization_id: { Args: never; Returns: string | null }
      can_manage_event: { Args: { p_event: string }; Returns: boolean }
      staff_events: { Args: never; Returns: Database['public']['Tables']['events']['Row'][] }

      is_admin: { Args: never; Returns: boolean }
      purchase_tickets: {
        Args: {
          p_event_id: string
          p_buyer_name: string
          p_buyer_email: string
          p_request_id?: string
          p_items: Json
        }
        Returns: string
      }
      get_order: { Args: { p_token: string }; Returns: Json }
      event_ticket_stats: {
        Args: { p_event_id: string }
        Returns: { ticket_type_id: string; sold: number; used: number }[]
      }
      validate_ticket: {
        Args: { p_code: string; p_event_id?: string }
        Returns: Json
      }
    }
    Enums: { ticket_status: 'valid' | 'used' | 'cancelled' }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TicketStatus = Database['public']['Enums']['ticket_status']

export type EventRegistrationOptions = {
  status?: 'draft' | 'published' | 'closed' | 'live' | 'finished' | 'cancelled'
  registration_enabled?: boolean
  registration_mode?: 'manual' | 'automatic' | 'payment' | 'pickup'
  phone_required?: boolean
  last_name_required?: boolean
  prevent_duplicates?: boolean
  privacy_controller?: string
  privacy_contact?: string
  retention_days?: number
  reservations_open_at?: string | null
  reservations_close_at?: string | null
  pickup_deadline?: string | null
  pickup_address?: string
  pickup_instructions?: string
  max_per_person?: number | null
  reserved_other_channels?: number
  pickup_item_name?: string
  attendee_details?: boolean
  require_document?: boolean
  require_birth_date?: boolean
  min_age?: number | null
  personal_data_purged_at?: string | null
  queue_enabled?: boolean
  queue_capacity?: number
}
