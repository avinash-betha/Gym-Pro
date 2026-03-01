import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './auth/auth-guard';

const routes: Routes = [

  /* ================================
     DEFAULT
  ================================= */
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },

  /* ================================
     AUTH
  ================================= */
  {
    path: 'login',
    loadComponent: () =>
      import('./auth/login/login.page').then(m => m.LoginPage),
  },

  {
    path: 'register',
    loadComponent: () =>
      import('./auth/register/register.page').then(m => m.RegisterPage),
  },

  /* ================================
     EXERCISE LOG
  ================================= */
  {
    path: 'exercise-log',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./exercise-log/exercise-log.page').then(m => m.ExerciseLogPage),
  },

  /* ================================
     TABS (LOGGED-IN USERS)
  ================================= */
  {
    path: 'tabs',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./tabs/tabs.module').then(m => m.TabsPageModule),
  },

  /* ================================
     FALLBACK
  ================================= */
  {
    path: '**',
    redirectTo: 'login',
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      preloadingStrategy: PreloadAllModules,
    }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
