import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SupabaseService } from './supabase.service';
import { Database } from '../types/supabase.types';

type NotificationPreferencesRow = Pick<
  Database['public']['Tables']['notification_preferences']['Row'],
  'daily_reminder_time' | 'gym_reminder_enabled'
>;

export type ReminderSyncResult =
  | 'scheduled'
  | 'disabled'
  | 'permission-denied'
  | 'unsupported'
  | 'invalid-time';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly workoutReminderId = 1;
  private isActionListenerAttached = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly router: Router,
    private readonly ngZone: NgZone
  ) {}

  registerTapAction(): void {
    if (this.isActionListenerAttached || !Capacitor.isNativePlatform()) {
      return;
    }

    LocalNotifications.addListener(
      'localNotificationActionPerformed',
      () => {
        this.ngZone.run(() => {
          void this.router.navigate(['/tabs/tab1']);
        });
      }
    );

    this.isActionListenerAttached = true;
  }

  initializeActionHandler(): void {
    this.registerTapAction();
  }

  async requestPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return true;
    }

    const permission = await LocalNotifications.requestPermissions();
    return permission.display === 'granted';
  }

  async cancelAllNotifications(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length === 0) {
      return;
    }

    await LocalNotifications.cancel({
      notifications: pending.notifications.map((notification) => ({
        id: notification.id,
      })),
    });
  }

  async scheduleDailyReminder(time: string): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return true;
    }

    await this.cancelAllNotifications();

    const parsedTime = this.parseTime(time);
    if (!parsedTime) {
      return false;
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: this.workoutReminderId,
          title: 'Workout Reminder',
          body: 'Time to log your workout and weight 📈',
          schedule: {
            repeats: true,
            allowWhileIdle: true,
            on: {
              hour: parsedTime.hour,
              minute: parsedTime.minute,
            },
          },
          extra: {
            target: '/tabs/tab1',
          },
        },
      ],
    });

    return true;
  }

  async syncReminderFromDatabase(userId: string): Promise<ReminderSyncResult> {
    if (!userId) {
      return 'disabled';
    }

    const { data, error } = await this.supabase.client
      .from('notification_preferences')
      .select('daily_reminder_time, gym_reminder_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return this.syncReminderFromPreferences(
      data ?? { daily_reminder_time: null, gym_reminder_enabled: false }
    );
  }

  async syncReminderFromPreferences(
    preferences: NotificationPreferencesRow
  ): Promise<ReminderSyncResult> {
    if (!Capacitor.isNativePlatform()) {
      return 'unsupported';
    }

    if (!preferences.gym_reminder_enabled || !preferences.daily_reminder_time) {
      await this.cancelAllNotifications();
      return 'disabled';
    }

    const permissionGranted = await this.requestPermission();
    if (!permissionGranted) {
      await this.cancelAllNotifications();
      return 'permission-denied';
    }

    const scheduled = await this.scheduleDailyReminder(
      preferences.daily_reminder_time
    );

    return scheduled ? 'scheduled' : 'invalid-time';
  }

  async cancelWorkoutReminder(): Promise<void> {
    await this.cancelAllNotifications();
  }

  private parseTime(
    dbTime: string
  ): { hour: number; minute: number } | null {
    const normalized = dbTime.trim();
    const match = normalized.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);

    if (!match) {
      return null;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    return { hour, minute };
  }
}
