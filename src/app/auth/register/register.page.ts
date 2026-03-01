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
      this.showToast(error.message, 'danger');
      return;
    }

    this.showToast('Verification email sent', 'success', 3000);
    this.router.navigate(['/login']);
  }

  goToLogin() {
    this.router.navigate(['/login']);
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
