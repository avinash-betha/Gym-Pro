import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../shared/services/notification.service';
import { SupabaseService } from '../shared/services/supabase.service';
import { Database } from '../shared/types/supabase.types';

type ProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'full_name' | 'height_cm'
>;

type BodyWeightRow = Pick<
  Database['public']['Tables']['body_weight_logs']['Row'],
  'weight'
>;

type NotificationPreferencesRow = Pick<
  Database['public']['Tables']['notification_preferences']['Row'],
  'daily_reminder_time' | 'gym_reminder_enabled'
>;

@Component({
  selector: 'app-profile',
  standalone: false,
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
})
export class ProfilePage {
  loading = false;
  errorMessage = '';

  fullName = '';
  heightCm: number | null = null;
  todayWeight: number | null = null;
  gymReminderEnabled = false;
  dailyReminderTime = '19:00';

  savingProfile = false;
  savingWeight = false;
  savingPreferences = false;

  private userId = '';
  private todayDate = '';

  constructor(
    private readonly auth: AuthService,
    private readonly supabase: SupabaseService,
    private readonly notificationService: NotificationService,
    private readonly router: Router,
    private readonly loadingCtrl: LoadingController,
    private readonly toastCtrl: ToastController
  ) {}

  ionViewWillEnter(): void {
    void this.loadProfileData();
  }

  async loadProfileData(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    const loading = await this.loadingCtrl.create({
      message: 'Loading profile...',
      spinner: 'crescent',
      mode: 'ios',
    });
    await loading.present();

    try {
      await this.ensureAuthenticatedUser();

      const [
        profileResult,
        weightResult,
        preferencesResult,
      ] = await Promise.all([
        this.supabase.client
          .from('profiles')
          .select('full_name, height_cm')
          .eq('id', this.userId)
          .maybeSingle(),
        this.supabase.client
          .from('body_weight_logs')
          .select('weight')
          .eq('user_id', this.userId)
          .eq('logged_on', this.todayDate)
          .maybeSingle(),
        this.supabase.client
          .from('notification_preferences')
          .select('daily_reminder_time, gym_reminder_enabled')
          .eq('user_id', this.userId)
          .maybeSingle(),
      ]);

      if (profileResult.error) {
        throw profileResult.error;
      }
      if (weightResult.error) {
        throw weightResult.error;
      }
      if (preferencesResult.error) {
        throw preferencesResult.error;
      }

      const profile = profileResult.data as ProfileRow | null;
      const weight = weightResult.data as BodyWeightRow | null;
      const preferences = preferencesResult.data as NotificationPreferencesRow | null;

      this.fullName = profile?.full_name ?? '';
      this.heightCm = profile?.height_cm ?? null;
      this.todayWeight = weight?.weight ?? null;
      this.gymReminderEnabled = preferences?.gym_reminder_enabled ?? false;
      this.dailyReminderTime =
        this.toInputTime(preferences?.daily_reminder_time ?? null) ?? '19:00';
    } catch (error) {
      console.error('LOAD PROFILE ERROR:', error);
      this.errorMessage = this.getErrorMessage(error);
      await this.showToast(this.errorMessage, 'danger');
    } finally {
      this.loading = false;
      await loading.dismiss();
    }
  }

  async saveProfile(): Promise<void> {
    if (!this.userId || this.savingProfile) {
      return;
    }

    this.savingProfile = true;
    try {
      const { error } = await this.supabase.client
        .from('profiles')
        .update({
          full_name: this.fullName.trim(),
          height_cm: this.heightCm,
        })
        .eq('id', this.userId);

      if (error) {
        throw error;
      }

      await this.showToast('Profile updated', 'success');
    } catch (error) {
      console.error('SAVE PROFILE ERROR:', error);
      await this.showToast(this.getErrorMessage(error), 'danger');
    } finally {
      this.savingProfile = false;
    }
  }

  async saveTodayWeight(): Promise<void> {
    if (!this.userId || this.savingWeight) {
      return;
    }

    if (this.todayWeight === null || !Number.isFinite(this.todayWeight) || this.todayWeight <= 0) {
      await this.showToast('Enter a valid weight', 'warning');
      return;
    }

    this.savingWeight = true;
    try {
      const { error } = await this.supabase.client
        .from('body_weight_logs')
        .upsert(
          {
            user_id: this.userId,
            weight: Number(this.todayWeight),
            logged_on: this.todayDate,
          },
          { onConflict: 'user_id,logged_on' }
        );

      if (error) {
        throw error;
      }

      await this.showToast('Today\'s weight saved', 'success');
    } catch (error) {
      console.error('SAVE WEIGHT ERROR:', error);
      await this.showToast(this.getErrorMessage(error), 'danger');
    } finally {
      this.savingWeight = false;
    }
  }

  async saveNotificationPreferences(): Promise<void> {
    if (!this.userId || this.savingPreferences) {
      return;
    }

    if (this.gymReminderEnabled && !this.dailyReminderTime) {
      await this.showToast('Choose a reminder time', 'warning');
      return;
    }

    this.savingPreferences = true;
    try {
      const normalizedTime = this.normalizeInputTime(this.dailyReminderTime);

      const { error } = await this.supabase.client
        .from('notification_preferences')
        .upsert(
          {
            user_id: this.userId,
            daily_reminder_time: this.gymReminderEnabled ? normalizedTime : null,
            gym_reminder_enabled: this.gymReminderEnabled,
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        throw error;
      }

      if (this.gymReminderEnabled) {
        const permissionGranted = await this.notificationService.requestPermission();
        if (!permissionGranted) {
          await this.notificationService.cancelAllNotifications();
          await this.showToast(
            'Enable notifications to receive daily reminders',
            'warning'
          );
          return;
        }

        const scheduled = await this.notificationService.scheduleDailyReminder(
          normalizedTime
        );

        if (!scheduled) {
          await this.showToast('Invalid reminder time', 'danger');
          return;
        }
      } else {
        await this.notificationService.cancelAllNotifications();
      }

      await this.showToast('Notification preferences saved', 'success');
    } catch (error) {
      console.error('SAVE NOTIFICATION PREFERENCES ERROR:', error);
      await this.showToast(this.getErrorMessage(error), 'danger');
    } finally {
      this.savingPreferences = false;
    }
  }

  async logout(): Promise<void> {
    const loading = await this.loadingCtrl.create({
      message: 'Signing out...',
      spinner: 'crescent',
      mode: 'ios',
    });
    await loading.present();

    try {
      await this.notificationService.cancelWorkoutReminder();
      await this.auth.logout();
      await this.router.navigate(['/login'], { replaceUrl: true });
    } catch (error) {
      console.error('LOGOUT ERROR:', error);
      await this.showToast('Unable to logout right now', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  private async ensureAuthenticatedUser(): Promise<void> {
    const user = await this.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    this.userId = user.id;
    this.todayDate = this.getLocalDateString(new Date());
  }

  private getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeInputTime(timeValue: string): string {
    if (!timeValue) {
      return '19:00:00';
    }

    return `${timeValue}:00`;
  }

  private toInputTime(timeValue: string | null): string | null {
    if (!timeValue) {
      return null;
    }

    const match = timeValue.match(/^(\d{2}:\d{2})/);
    return match ? match[1] : null;
  }

  private getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return 'Something went wrong. Please try again.';
  }

  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'warning'
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2200,
      color,
      position: 'bottom',
      mode: 'ios',
    });
    await toast.present();
  }
}
