// Tipos de la base de datos con el mismo formato que `supabase gen types typescript`.
// Regenerar tras cambiar migraciones: `npx supabase gen types typescript --local > src/lib/db/types.ts`

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };

export type Database = {
  __InternalSupabase: { PostgrestVersion: '12' };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          timezone: string;
          review_time: string;
          review_enabled: boolean;
          last_exported_at: string | null;
        } & Timestamps;
        Insert: {
          id: string;
          display_name?: string | null;
          timezone?: string;
          review_time?: string;
          review_enabled?: boolean;
        };
        Update: {
          display_name?: string | null;
          timezone?: string;
          review_time?: string;
          review_enabled?: boolean;
          last_exported_at?: string | null;
        };
        Relationships: [];
      };
      habits: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          position: number;
          archived_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          description?: string | null;
          position?: number;
          archived_at?: string | null;
        };
        Update: {
          name?: string;
          description?: string | null;
          position?: number;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      habit_logs: {
        Row: { habit_id: string; user_id: string; day: string; created_at: string };
        Insert: { habit_id: string; user_id?: string; day: string };
        Update: { day?: string };
        Relationships: [
          {
            foreignKeyName: 'habit_logs_habit_id_user_id_fkey';
            columns: ['habit_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'habits';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          note: string | null;
          due_date: string | null;
          due_time: string | null;
          done_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          note?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          done_at?: string | null;
        };
        Update: {
          title?: string;
          note?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          done_at?: string | null;
        };
        Relationships: [];
      };
      notes: {
        Row: { user_id: string; day: string; body: string; last_device: string | null } & Timestamps;
        Insert: { user_id?: string; day: string; body: string; last_device?: string | null };
        Update: { body?: string; last_device?: string | null };
        Relationships: [];
      };
      review_sessions: {
        Row: {
          user_id: string;
          day: string;
          answers: Json;
          completed_at: string | null;
          updated_at: string;
        };
        Insert: { user_id?: string; day: string; answers?: Json; completed_at?: string | null };
        Update: { answers?: Json; completed_at?: string | null };
        Relationships: [];
      };
      push_subscriptions: {
        Row: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; created_at: string };
        Insert: { id?: string; user_id?: string; endpoint: string; p256dh: string; auth: string };
        Update: { endpoint?: string; p256dh?: string; auth?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      export_backup: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      mark_backup_exported: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      import_legacy_backup: {
        Args: { payload: Json };
        Returns: Json;
      };
      record_review_answer: {
        Args: { p_day: string; p_habit_id: string; p_answer: 'yes' | 'no' };
        Returns: Json;
      };
      save_note: {
        Args: { p_day: string; p_body: string; p_base: string | null; p_device: string | null };
        Returns: Json;
      };
      delete_account: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      is_valid_timezone: {
        Args: { tz: string };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicTables = Database['public']['Tables'];
export type Row<T extends keyof PublicTables> = PublicTables[T]['Row'];

export type Profile = Row<'profiles'>;
export type Habit = Row<'habits'>;
export type HabitLog = Row<'habit_logs'>;
export type Task = Row<'tasks'>;
export type Note = Row<'notes'>;
export type SaveOutcome = 'saved' | 'deleted' | 'merged' | 'kept' | 'too_long';
export type SaveResult = { outcome: SaveOutcome; note: Note | null };
export type ReviewSession = Row<'review_sessions'>;
