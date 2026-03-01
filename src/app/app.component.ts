import { Component, OnInit } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { NotificationService } from './shared/services/notification.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly auth: AuthService
  ) {}

  ngOnInit(): void {
    void this.initializeNotifications();
  }

  private async initializeNotifications(): Promise<void> {
    this.notificationService.registerTapAction();

    try {
      const user = await this.auth.getUser();
      if (!user) {
        return;
      }

      await this.notificationService.syncReminderFromDatabase(user.id);
    } catch (error) {
      console.warn('NOTIFICATION INIT ERROR:', error);
    }
  }
}
