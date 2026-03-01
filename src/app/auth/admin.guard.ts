import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {

  constructor(
    private auth: AuthService,
    private router: Router
  ) {}

  async canActivate(): Promise<boolean> {
    const user = await this.auth.getUser();
    if (!user) {
      this.router.navigate(['/login'], { replaceUrl: true });
      return false;
    }

    const role = await this.auth.getUserRole(user.id);
    if (role === 'admin') {
      return true;
    }

    this.router.navigate(['/tabs'], { replaceUrl: true });
    return false;
  }
}
