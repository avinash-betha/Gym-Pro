import { Component, OnInit } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../shared/services/supabase.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage implements OnInit {
  isAdmin = false;
  private userId = '';

  constructor(
    private readonly auth: AuthService,
    private readonly supabase: SupabaseService
  ) {}

  ngOnInit(): void {
    void this.loadRole();
  }

  ionViewWillEnter(): void {
    void this.loadRole();
  }

  private async loadRole(): Promise<void> {
    const user = await this.auth.getUser();
    if (!user) {
      this.isAdmin = false;
      return;
    }

    this.userId = user.id;

    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('role')
      .eq('id', this.userId)
      .maybeSingle();

    if (error) {
      console.error('LOAD ROLE ERROR:', error);
      this.isAdmin = false;
      return;
    }

    this.isAdmin = data?.role === 'admin';
  }
}
