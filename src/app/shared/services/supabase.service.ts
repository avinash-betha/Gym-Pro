import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Database } from '../types/supabase.types';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient<Database>;

  constructor() {
    this.supabase = createClient<Database>(
      environment.supabaseUrl,
      environment.supabaseAnonKey
    );
  }

  get client() {
    return this.supabase;
  }
}
