import { Injectable } from '@angular/core';
import { SupabaseService } from '../shared/services/supabase.service';
import { environment } from '../../environments/environment';

type UserRole = 'admin' | 'user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  constructor(private supabaseService: SupabaseService) {}

  async login(email: string, password: string) {
    return await this.supabaseService.client.auth.signInWithPassword({
      email,
      password,
    });
  }

  async register(
    email: string,
    password: string,
    meta: { name: string; mobile: string }
  ) {
    const emailRedirectTo =
      environment.authRedirectTo || `${window.location.origin}/login`;

    const signUpResult = await this.supabaseService.client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          name: meta.name,
          mobile: meta.mobile,
        },
      },
    });

    if (signUpResult.error || !signUpResult.data.user) {
      return signUpResult;
    }

    // If email confirmation is enabled, signUp usually returns no active session.
    // In that case, profile creation should be handled by a DB trigger on auth.users.
    if (!signUpResult.data.session) {
      return signUpResult;
    }

    const { error: profileError } = await this.supabaseService.client
      .from('profiles')
      .upsert(
        {
          id: signUpResult.data.user.id,
          full_name: meta.name,
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      return { data: signUpResult.data, error: profileError };
    }

    return signUpResult;
  }

  async getUser() {
    const { data } = await this.supabaseService.client.auth.getUser();
    return data.user;
  }

  async logout() {
    return await this.supabaseService.client.auth.signOut();
  }

  async getSession() {
    return await this.supabaseService.client.auth.getSession();
  }

  async saveUserProfile(profile: {
    id: string;
    full_name: string;
    role?: UserRole;
  }) {
    return await this.supabaseService.client
      .from('profiles')
      .upsert(profile, { onConflict: 'id' });
  }

  async getProfile(userId: string) {
    return await this.supabaseService.client
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', userId)
      .maybeSingle();
  }

  async getUserRole(userId: string): Promise<UserRole | null> {
    const { data, error } = await this.supabaseService.client
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      return null;
    }

    return (data?.role as UserRole | null) ?? null;
  }
}
