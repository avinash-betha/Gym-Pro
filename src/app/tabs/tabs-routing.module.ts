import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';
import { AdminGuard } from '../auth/admin.guard';

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'tab1',
        loadComponent: () =>
          import('../tab1/tab1.page').then((m) => m.Tab1Page),
      },
      {
        path: 'history',
        loadChildren: () =>
          import('../history/history.module').then((m) => m.HistoryPageModule),
      },
      {
        path: 'analytics',
        loadChildren: () =>
          import('../analytics/analytics.module').then(
            (m) => m.AnalyticsPageModule
          ),
      },
      {
        path: 'profile',
        loadChildren: () =>
          import('../profile/profile.module').then((m) => m.ProfilePageModule),
      },
      {
        path: 'admin',
        canActivate: [AdminGuard],
        loadChildren: () =>
          import('../admin/admin.module').then((m) => m.AdminPageModule),
      },
      {
        path: 'tab2',
        redirectTo: 'history',
        pathMatch: 'full',
      },
      {
        path: 'tab3',
        redirectTo: 'analytics',
        pathMatch: 'full',
      },
      {
        path: 'tab4',
        redirectTo: 'profile',
        pathMatch: 'full',
      },
      {
        path: 'exercise/:id',
        loadComponent: () =>
          import('../exercise-detail/exercise-detail.page').then(
            (m) => m.ExerciseDetailPage
          ),
      },
      {
        path: '',
        redirectTo: 'tab1',
        pathMatch: 'full',
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class TabsPageRoutingModule {}
