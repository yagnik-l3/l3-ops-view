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
      deals: {
        Row: {
          actual_close_date: string | null
          client_name: string
          closed_by: string | null
          created_at: string | null
          expected_close_date: string | null
          id: string
          linked_project_id: string | null
          name: string
          status: Database["public"]["Enums"]["deal_status"]
          value: number
        }
        Insert: {
          actual_close_date?: string | null
          client_name: string
          closed_by?: string | null
          created_at?: string | null
          expected_close_date?: string | null
          id?: string
          linked_project_id?: string | null
          name: string
          status?: Database["public"]["Enums"]["deal_status"]
          value?: number
        }
        Update: {
          actual_close_date?: string | null
          client_name?: string
          closed_by?: string | null
          created_at?: string | null
          expected_close_date?: string | null
          id?: string
          linked_project_id?: string | null
          name?: string
          status?: Database["public"]["Enums"]["deal_status"]
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "deals_linked_project_id_fkey"
            columns: ["linked_project_id"]
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
      sales_targets: {
        Row: {
          achieved_amount: number
          created_at: string | null
          id: string
          month: string
          notes: string | null
          target_amount: number
        }
        Insert: {
          achieved_amount?: number
          created_at?: string | null
          id?: string
          month: string
          notes?: string | null
          target_amount?: number
        }
        Update: {
          achieved_amount?: number
          created_at?: string | null
          id?: string
          month?: string
          notes?: string | null
          target_amount?: number
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          role?: string
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
      deal_status:
        | "prospect"
        | "proposal"
        | "negotiation"
        | "closed_won"
        | "closed_lost"
      person_type: "developer" | "designer" | "other"
      project_status:
        | "pipeline"
        | "active"
        | "in_production"
        | "completed"
        | "on_hold"
        | "paused"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ── Convenience type aliases ────────────────────────────────────────────────

export type ProjectStatus = Database["public"]["Enums"]["project_status"]
export type PersonType = Database["public"]["Enums"]["person_type"]
export type DealStatus = Database["public"]["Enums"]["deal_status"]
export type UserRole = "sales" | "production"

export type Project = Database["public"]["Tables"]["projects"]["Row"]
export type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"]
export type Person = Database["public"]["Tables"]["people"]["Row"]
export type PersonInsert = Database["public"]["Tables"]["people"]["Insert"]
export type Allocation = Database["public"]["Tables"]["allocations"]["Row"]
export type AllocationInsert = Database["public"]["Tables"]["allocations"]["Insert"]
export type SalesTarget = Database["public"]["Tables"]["sales_targets"]["Row"]
export type Deal = Database["public"]["Tables"]["deals"]["Row"]
export type DealInsert = Database["public"]["Tables"]["deals"]["Insert"]
export type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"]

// Extended join types
export type AllocationWithProject = Allocation & { projects: Project }
export type AllocationWithPerson = Allocation & { people: Person }
export type ProjectWithAllocations = Project & { allocations: AllocationWithPerson[] }
export type PersonWithAllocations = Person & { allocations: AllocationWithProject[] }
