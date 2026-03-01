import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private router: Router
  ) {}

  async canActivate(): Promise<boolean> {
    const { data } = await this.auth.getSession();

    if (!data.session) {
      this.router.navigate(['/login']);
      return false;
    }

    return true;
  }
}