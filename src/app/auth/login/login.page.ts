import { Component } from '@angular/core';
import {
  IonicModule,
  LoadingController,
  ToastController
} from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { NotificationService } from '../../shared/services/notification.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FormsModule
  ],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {

  email = '';
  password = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private notificationService: NotificationService
  ) {}

  async login() {
    if (!this.email || !this.password) {
      this.showToast('Please enter email and password', 'danger');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Signing you in...',
      spinner: 'crescent',
    });

    await loading.present();

    const { data, error } = await this.auth.login(this.email, this.password);

    if (error) {
      await loading.dismiss();
      this.showToast(error.message, 'danger');
      return;
    }

    if (!data.user?.email_confirmed_at) {
      await loading.dismiss();
      this.showToast('Please verify your email to continue', 'warning', 3000);
      await this.auth.logout();
      return;
    }

    const role = await this.auth.getUserRole(data.user.id);

    try {
      await this.notificationService.syncReminderFromDatabase(data.user.id);
    } catch (notificationError) {
      console.warn('NOTIFICATION SCHEDULE ERROR:', notificationError);
    }

    await loading.dismiss();

    this.showToast('Signed in successfully', 'success');

    if (role === 'admin') {
      this.router.navigate(['/tabs/admin'], { replaceUrl: true });
    } else {
      this.router.navigate(['/tabs'], { replaceUrl: true });
    }
  }

  goToRegister() {
    this.router.navigate(['/register']);
  }

  async showToast(
    message: string,
    color: 'success' | 'danger' | 'warning' | 'primary' = 'primary',
    duration = 2500
  ) {
    const toast = await this.toastCtrl.create({
      message,
      duration,
      color,
      position: 'bottom',
      mode: 'ios'
    });
    await toast.present();
  }
}
