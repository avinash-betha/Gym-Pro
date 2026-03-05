import { Component } from '@angular/core';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FormsModule
  ],
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
})
export class RegisterPage {
  name = '';
  email = '';
  mobile = '';
  password = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  async register() {
    if (!this.name || !this.email || !this.password) {
      this.showToast('Please fill required fields', 'danger');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Creating your account…',
      spinner: 'crescent',
    });
    await loading.present();

    const { error } = await this.auth.register(
      this.email,
      this.password,
      {
        name: this.name,
        mobile: this.mobile || '',
      }
    );

    await loading.dismiss();

    if (error) {
      const message = this.getRegisterErrorMessage(error.message);
      const color =
        message === 'Account already exists. Please login.'
          ? 'warning'
          : 'danger';
      this.showToast(message, color);
      if (message === 'Account already exists. Please login.') {
        this.router.navigate(['/login']);
      }
      return;
    }

    this.showToast('Verification email sent', 'success', 3000);
    this.router.navigate(['/login']);
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  private getRegisterErrorMessage(rawMessage: string): string {
    const message = (rawMessage || '').toLowerCase();

    if (message.includes('user already registered')) {
      return 'Account already exists. Please login.';
    }

    if (message.includes('email rate limit exceeded')) {
      return 'Too many attempts. Please try again in a few minutes.';
    }

    return rawMessage || 'Unable to create account right now.';
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
    });
    await toast.present();
  }
}
