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
          monthly_salary: number | null
          notes: string | null
          person_id: string
          project_id: string
          start_date: string
        }
        Insert: {
          capacity_percent?: number
          created_at?: string | null
          end_date: string
          hourly_rate?: number | null
          id?: string
          monthly_salary?: number | null
          notes?: string | null
          person_id: string
          project_id: string
          start_date: string
        }
        Update: {
          capacity_percent?: number
          created_at?: string | null
          end_date?: string
          hourly_rate?: number | null
          id?: string
          monthly_salary?: number | null
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
      leads: {
        Row: {
          client_name: string | null
          company_name: string | null
          connect_via: Database["public"]["Enums"]["connect_via"]
          contact_detail: string | null
          converted_amount: number | null
          converted_date: string | null
          created_at: string | null
          date_of_first_approach: string
          id: number
          last_contacted_at: string | null
          mediator: string | null
          poc: string | null
          quotation_amount: number | null
          remark: string | null
          requirement: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string | null
        }
        Insert: {
          client_name?: string | null
          company_name?: string | null
          connect_via: Database["public"]["Enums"]["connect_via"]
          contact_detail?: string | null
          converted_amount?: number | null
          converted_date?: string | null
          created_at?: string | null
          date_of_first_approach?: string
          id?: number
          last_contacted_at?: string | null
          mediator?: string | null
          poc?: string | null
          quotation_amount?: number | null
          remark?: string | null
          requirement?: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string | null
        }
        Update: {
          client_name?: string | null
          company_name?: string | null
          connect_via?: Database["public"]["Enums"]["connect_via"]
          contact_detail?: string | null
          converted_amount?: number | null
          converted_date?: string | null
          created_at?: string | null
          date_of_first_approach?: string
          id?: number
          last_contacted_at?: string | null
          mediator?: string | null
          poc?: string | null
          quotation_amount?: number | null
          remark?: string | null
          requirement?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string | null
        }
        Relationships: []
      }
      ledger_accounts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          type: Database["public"]["Enums"]["ledger_account_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          type: Database["public"]["Enums"]["ledger_account_type"]
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          type?: Database["public"]["Enums"]["ledger_account_type"]
        }
        Relationships: []
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
          lost_at: string | null
          lost_reason: string | null
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
          lost_at?: string | null
          lost_reason?: string | null
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
          lost_at?: string | null
          lost_reason?: string | null
          name?: string
          notes?: string | null
          sales_value?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_end_date?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          counterparty: string | null
          created_at: string
          created_by: string | null
          date: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          expense_category: Database["public"]["Enums"]["expense_category"] | null
          id: string
          notes: string | null
          person_id: string | null
          project_id: string | null
          reference: string | null
          transfer_pair_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          account_id: string
          amount: number
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          expense_category?: Database["public"]["Enums"]["expense_category"] | null
          id?: string
          notes?: string | null
          person_id?: string | null
          project_id?: string | null
          reference?: string | null
          transfer_pair_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          account_id?: string
          amount?: number
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          direction?: Database["public"]["Enums"]["transaction_direction"]
          expense_category?: Database["public"]["Enums"]["expense_category"] | null
          id?: string
          notes?: string | null
          person_id?: string | null
          project_id?: string | null
          reference?: string | null
          transfer_pair_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      connect_via: "whatsapp" | "facebook" | "linkedin" | "email" | "call"
      expense_category:
        | "salary"
        | "office"
        | "software"
        | "marketing_sales"
        | "charges"
        | "other"
      lead_source: "linkedin" | "relation" | "scouting" | "pa" | "inbound"
      lead_status:
        | "initial_call"
        | "gave_quote"
        | "done"
        | "not_interested"
        | "interested"
        | "not_converted"
      ledger_account_type: "cash" | "bank"
      person_type: "developer" | "designer" | "other" | "founder"
      project_status:
        | "pipeline"
        | "active"
        | "in_production"
        | "completed"
        | "on_hold"
        | "paused"
        | "lost"
      transaction_direction: "in" | "out"
      transaction_type:
        | "expense"
        | "collection"
        | "transfer"
        | "opening_balance"
        | "other_income"
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

export type LedgerAccountType   = Database["public"]["Enums"]["ledger_account_type"]
export type TransactionType     = Database["public"]["Enums"]["transaction_type"]
export type ExpenseCategory     = Database["public"]["Enums"]["expense_category"]
export type TransactionDirection = Database["public"]["Enums"]["transaction_direction"]

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

export type LedgerAccount       = Database["public"]["Tables"]["ledger_accounts"]["Row"]
export type LedgerAccountInsert = Database["public"]["Tables"]["ledger_accounts"]["Insert"]
export type LedgerAccountUpdate = Database["public"]["Tables"]["ledger_accounts"]["Update"]

export type Transaction       = Database["public"]["Tables"]["transactions"]["Row"]
export type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"]
export type TransactionUpdate = Database["public"]["Tables"]["transactions"]["Update"]

// Extended join types
export type AllocationWithProject = Allocation & { projects: Project }
export type AllocationWithPerson = Allocation & { people: Person }
export type ProjectWithAllocations = Project & { allocations: AllocationWithPerson[] }
export type PersonWithAllocations = Person & { allocations: AllocationWithProject[] }

export type TransactionWithRelations = Transaction & {
  ledger_accounts: LedgerAccount | null
  projects: Project | null
  people: Person | null
}
