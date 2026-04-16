export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      allocations: {
        Row: {
          capacity_percent: number
          created_at: string | null
          end_date: string
          hourly_rate: number | null
          id: string
          notes: string | null
          person_id: string
          project_id: string
          start_date: string
        }
        Insert: {
          capacity_percent?: number
          created_at?: string | null
          hourly_rate?: number | null
          end_date: string
          id?: string
          notes?: string | null
          person_id: string
          project_id: string
          start_date: string
        }
        Update: {
          capacity_percent?: number
          created_at?: string | null
          hourly_rate?: number | null
          end_date?: string
          id?: string
          notes?: string | null
          person_id?: string
          project_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          avatar_color: string | null
          avatar_initials: string | null
          created_at: string | null
          default_hourly_rate: number | null
          id: string
          is_active: boolean
          monthly_salary: number | null
          name: string
          role: string
          type: Database["public"]["Enums"]["person_type"]
        }
        Insert: {
          avatar_color?: string | null
          avatar_initials?: string | null
          created_at?: string | null
          default_hourly_rate?: number | null
          id?: string
          is_active?: boolean
          monthly_salary?: number | null
          name: string
          role: string
          type?: Database["public"]["Enums"]["person_type"]
        }
        Update: {
          avatar_color?: string | null
          avatar_initials?: string | null
          created_at?: string | null
          default_hourly_rate?: number | null
          id?: string
          is_active?: boolean
          monthly_salary?: number | null
          name?: string
          role?: string
          type?: Database["public"]["Enums"]["person_type"]
        }
        Relationships: []
      }
      projects: {
        Row: {
          actual_end_date: string | null
          client_name: string
          closed_by: string | null
          color: string | null
          created_at: string | null
          delay_reason: string | null
          estimated_weeks: number | null
          id: string
          name: string
          notes: string | null
          sales_value: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          target_end_date: string | null
        }
        Insert: {
          actual_end_date?: string | null
          client_name: string
          closed_by?: string | null
          color?: string | null
          created_at?: string | null
          delay_reason?: string | null
          estimated_weeks?: number | null
          id?: string
          name: string
          notes?: string | null
          sales_value?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_end_date?: string | null
        }
        Update: {
          actual_end_date?: string | null
          client_name?: string
          closed_by?: string | null
          color?: string | null
          created_at?: string | null
          delay_reason?: string | null
          estimated_weeks?: number | null
          id?: string
          name?: string
          notes?: string | null
          sales_value?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_end_date?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          id: number
          date_of_first_approach: string
          client_name: string | null
          company_name: string | null
          contact_detail: string | null
          connect_via: Database["public"]["Enums"]["connect_via"]
          requirement: string | null
          source: Database["public"]["Enums"]["lead_source"]
          mediator: string | null
          poc: string | null
          quotation_amount: number | null
          status: Database["public"]["Enums"]["lead_status"]
          remark: string | null
          last_contacted_at: string | null
          converted_amount: number | null
          converted_date: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          date_of_first_approach?: string
          client_name?: string | null
          company_name?: string | null
          contact_detail?: string | null
          connect_via: Database["public"]["Enums"]["connect_via"]
          requirement?: string | null
          source: Database["public"]["Enums"]["lead_source"]
          mediator?: string | null
          poc?: string | null
          quotation_amount?: number | null
          status?: Database["public"]["Enums"]["lead_status"]
          remark?: string | null
          last_contacted_at?: string | null
          converted_amount?: number | null
          converted_date?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          date_of_first_approach?: string
          client_name?: string | null
          company_name?: string | null
          contact_detail?: string | null
          connect_via?: Database["public"]["Enums"]["connect_via"]
          requirement?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          mediator?: string | null
          poc?: string | null
          quotation_amount?: number | null
          status?: Database["public"]["Enums"]["lead_status"]
          remark?: string | null
          last_contacted_at?: string | null
          converted_amount?: number | null
          converted_date?: string | null
          created_at?: string | null
          updated_at?: string | null
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
      person_type: "developer" | "designer" | "other"
      project_status:
      | "pipeline"
      | "active"
      | "in_production"
      | "completed"
      | "on_hold"
      | "paused"
      connect_via: "whatsapp" | "facebook" | "linkedin" | "email" | "call"
      lead_source: "linkedin" | "relation" | "scouting" | "pa" | "inbound"
      lead_status:
      | "initial_call"
      | "gave_quote"
      | "done"
      | "not_interested"
      | "interested"
      | "not_converted"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ── Convenience type aliases ────────────────────────────────────────────────

export type ProjectStatus = Database["public"]["Enums"]["project_status"]
export type PersonType = Database["public"]["Enums"]["person_type"]
export type ConnectVia = Database["public"]["Enums"]["connect_via"]
export type LeadSource = Database["public"]["Enums"]["lead_source"]
export type LeadStatus = Database["public"]["Enums"]["lead_status"]
export type DealStatus = Database["public"]["Enums"]
export type UserRole = "sales" | "production"

export type Project = Database["public"]["Tables"]["projects"]["Row"]
export type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"]
export type Person = Database["public"]["Tables"]["people"]["Row"]
export type PersonInsert = Database["public"]["Tables"]["people"]["Insert"]
export type Allocation = Database["public"]["Tables"]["allocations"]["Row"]
export type AllocationInsert = Database["public"]["Tables"]["allocations"]["Insert"]
export type SalesTarget = Database["public"]["Tables"]
export type Deal = Database["public"]["Tables"]
export type DealInsert = Database["public"]["Tables"]
export type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"]
export type Lead = Database["public"]["Tables"]["leads"]["Row"]
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"]
export type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"]

// Extended join types
export type AllocationWithProject = Allocation & { projects: Project }
export type AllocationWithPerson = Allocation & { people: Person }
export type ProjectWithAllocations = Project & { allocations: AllocationWithPerson[] }
export type PersonWithAllocations = Person & { allocations: AllocationWithProject[] }
