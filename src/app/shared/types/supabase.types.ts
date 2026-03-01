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
      profiles: {
        Row: {
          id: string;
          full_name: string;
          height_cm: number | null;
          role: 'user' | 'admin';
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          height_cm?: number | null;
          role?: 'user' | 'admin';
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          height_cm?: number | null;
          role?: 'user' | 'admin';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey';
            columns: ['id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      workout_splits: {
        Row: {
          id: string;
          split_label: string;
          day_of_week: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          split_label: string;
          day_of_week: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          split_label?: string;
          day_of_week?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      exercises: {
        Row: {
          id: string;
          name: string;
          body_part: string | null;
          sort_order: number;
          media_path: string | null;
          instructions: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          body_part?: string | null;
          sort_order?: number;
          media_path?: string | null;
          instructions?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          body_part?: string | null;
          sort_order?: number;
          media_path?: string | null;
          instructions?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      split_exercises: {
        Row: {
          id: string;
          split_id: string;
          exercise_id: string;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          split_id: string;
          exercise_id: string;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          split_id?: string;
          exercise_id?: string;
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'split_exercises_split_id_fkey';
            columns: ['split_id'];
            isOneToOne: false;
            referencedRelation: 'workout_splits';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'split_exercises_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      exercise_completion: {
        Row: {
          id: string;
          user_id: string;
          exercise_id: string;
          completed_on: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          exercise_id: string;
          completed_on?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          exercise_id?: string;
          completed_on?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exercise_completion_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exercise_completion_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      exercise_logs: {
        Row: {
          id: string;
          user_id: string;
          exercise_id: string;
          reps: number;
          weight: number;
          log_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          exercise_id: string;
          reps: number;
          weight: number;
          log_date?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          exercise_id?: string;
          reps?: number;
          weight?: number;
          log_date?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exercise_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exercise_logs_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      body_weight_logs: {
        Row: {
          id: string;
          user_id: string;
          weight: number;
          logged_on: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          weight: number;
          logged_on?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          weight?: number;
          logged_on?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'body_weight_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          daily_reminder_time: string | null;
          gym_reminder_enabled: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          daily_reminder_time?: string | null;
          gym_reminder_enabled?: boolean;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          daily_reminder_time?: string | null;
          gym_reminder_enabled?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}
