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
      calls: {
        Row: {
          id: string;
          vapi_call_id: string | null;
          transcript: string | null;
          quotable_quote: string | null;
          frustration_score: number | null;
          recording_url: string | null;
          duration_seconds: number | null;
          ip_address: string | null;
          latitude: number | null;
          longitude: number | null;
          city: string | null;
          region: string | null;
          country: string | null;
          is_sample: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          vapi_call_id?: string | null;
          transcript?: string | null;
          quotable_quote?: string | null;
          frustration_score?: number | null;
          recording_url?: string | null;
          duration_seconds?: number | null;
          ip_address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          city?: string | null;
          region?: string | null;
          country?: string | null;
          is_sample?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          vapi_call_id?: string | null;
          transcript?: string | null;
          quotable_quote?: string | null;
          frustration_score?: number | null;
          recording_url?: string | null;
          duration_seconds?: number | null;
          ip_address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          city?: string | null;
          region?: string | null;
          country?: string | null;
          is_sample?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          call_id: string | null;
          is_physician_owner: boolean | null;
          works_at_independent_clinic: boolean | null;
          interested_in_collective: boolean | null;
          name: string | null;
          email: string | null;
          created_at: string;
          // New broader qualification fields
          works_in_healthcare: boolean | null;
          workplace_type: "independent" | "hospital" | null;
          role_type: "owner" | "provider" | "front_office" | null;
          // Consent fields
          consent_share_quote: boolean | null;
          consent_store_chatlog: boolean | null;
        };
        Insert: {
          id?: string;
          call_id?: string | null;
          is_physician_owner?: boolean | null;
          works_at_independent_clinic?: boolean | null;
          interested_in_collective?: boolean | null;
          name?: string | null;
          email?: string | null;
          created_at?: string;
          works_in_healthcare?: boolean | null;
          workplace_type?: "independent" | "hospital" | null;
          role_type?: "owner" | "provider" | "front_office" | null;
          consent_share_quote?: boolean | null;
          consent_store_chatlog?: boolean | null;
        };
        Update: {
          id?: string;
          call_id?: string | null;
          is_physician_owner?: boolean | null;
          works_at_independent_clinic?: boolean | null;
          interested_in_collective?: boolean | null;
          name?: string | null;
          email?: string | null;
          created_at?: string;
          works_in_healthcare?: boolean | null;
          workplace_type?: "independent" | "hospital" | null;
          role_type?: "owner" | "provider" | "front_office" | null;
          consent_share_quote?: boolean | null;
          consent_store_chatlog?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "leads_call_id_fkey";
            columns: ["call_id"];
            referencedRelation: "calls";
            referencedColumns: ["id"];
          }
        ];
      };
      featured_quotes: {
        Row: {
          id: string;
          call_id: string | null;
          quote: string;
          location: string | null;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          call_id?: string | null;
          quote: string;
          location?: string | null;
          display_order: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          call_id?: string | null;
          quote?: string;
          location?: string | null;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "featured_quotes_call_id_fkey";
            columns: ["call_id"];
            referencedRelation: "calls";
            referencedColumns: ["id"];
          }
        ];
      };
      usage_limits: {
        Row: {
          id: string;
          ip_address: string;
          fingerprint: string | null;
          used_seconds: number;
          window_start: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ip_address: string;
          fingerprint?: string | null;
          used_seconds?: number;
          window_start?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ip_address?: string;
          fingerprint?: string | null;
          used_seconds?: number;
          window_start?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      link_clicks: {
        Row: {
          id: string;
          link_type: string;
          link_url: string;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          link_type: string;
          link_url: string;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          link_type?: string;
          link_url?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Call = Database["public"]["Tables"]["calls"]["Row"];
export type CallInsert = Database["public"]["Tables"]["calls"]["Insert"];
export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
export type FeaturedQuote = Database["public"]["Tables"]["featured_quotes"]["Row"];
export type FeaturedQuoteInsert = Database["public"]["Tables"]["featured_quotes"]["Insert"];
export type FeaturedQuoteUpdate = Database["public"]["Tables"]["featured_quotes"]["Update"];
export type LinkClick = Database["public"]["Tables"]["link_clicks"]["Row"];
export type LinkClickInsert = Database["public"]["Tables"]["link_clicks"]["Insert"];
