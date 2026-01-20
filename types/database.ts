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
          interested_in_collective: boolean | null;
          name: string | null;
          email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          call_id?: string | null;
          is_physician_owner?: boolean | null;
          interested_in_collective?: boolean | null;
          name?: string | null;
          email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          call_id?: string | null;
          is_physician_owner?: boolean | null;
          interested_in_collective?: boolean | null;
          name?: string | null;
          email?: string | null;
          created_at?: string;
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
