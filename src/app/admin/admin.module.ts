import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AdminPage } from './admin.page';

@NgModule({
  imports: [
    AdminPage,
    RouterModule.forChild([
      {
        path: '',
        component: AdminPage,
      },
    ]),
  ],
})
export class AdminPageModule {}
