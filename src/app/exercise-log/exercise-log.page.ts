import { Component, OnInit } from '@angular/core';
import { IonicModule, ToastController, LoadingController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { SupabaseService } from '../shared/services/supabase.service';
import { AuthService } from '../auth/auth.service';

interface SetEntry {
  reps: number | null;
  weight: number | null;
}

@Component({
  selector: 'app-exercise-log',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './exercise-log.page.html',
  styleUrls: ['./exercise-log.page.scss'],
})
export class ExerciseLogPage implements OnInit {
  exerciseName = '';
  exerciseId = '';
  sets: SetEntry[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private supabase: SupabaseService,
    private auth: AuthService,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) {}

  async ngOnInit() {
    this.addSet();

    const exerciseIdParam = this.route.snapshot.queryParamMap.get('exerciseId');
    const exerciseNameParam =
      this.route.snapshot.queryParamMap.get('exerciseName') ||
      this.route.snapshot.queryParamMap.get('name');

    if (exerciseIdParam) {
      await this.loadExerciseById(exerciseIdParam);
      return;
    }

    if (exerciseNameParam) {
      await this.loadExerciseByName(exerciseNameParam);
      return;
    }

    await this.showToast('Exercise not found', 'danger');
    this.router.navigate(['/tabs/tab1']);
  }

  addSet() {
    this.sets.push({ reps: null, weight: null });
  }

  removeSet(index: number) {
    this.sets.splice(index, 1);
  }

  async saveWorkout() {
    const user = await this.auth.getUser();
    if (!user || !this.exerciseId) {
      await this.showToast('User or exercise not found', 'danger');
      return;
    }

    const today = this.getLocalDateString(new Date());

    const logs = this.sets
      .map(set => ({
        user_id: user.id,
        exercise_id: this.exerciseId,
        reps: Number(set.reps),
        weight: Number(set.weight),
        log_date: today,
      }))
      .filter(
        log =>
          !Number.isNaN(log.reps) &&
          !Number.isNaN(log.weight) &&
          log.reps > 0 &&
          log.weight >= 0
      );

    if (logs.length === 0) {
      await this.showToast('Enter at least one complete set', 'warning');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Saving workout...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      const { error: logError } = await this.supabase.client
        .from('exercise_logs')
        .insert(logs);

      if (logError) {
        throw logError;
      }

      const { count, error: countError } = await this.supabase.client
        .from('exercise_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('exercise_id', this.exerciseId)
        .eq('log_date', today);

      if (countError) {
        throw countError;
      }

      if ((count ?? 0) >= 3) {
        const { error: completionError } = await this.supabase.client
          .from('exercise_completion')
          .upsert(
            {
              user_id: user.id,
              exercise_id: this.exerciseId,
              completed_on: today,
            },
            { onConflict: 'user_id,exercise_id,completed_on' }
          );

        if (completionError) {
          throw completionError;
        }
      }

      await this.showToast('Workout saved', 'success');
      this.router.navigate(['/tabs/tab1']);
    } catch (error: unknown) {
      console.error('SAVE WORKOUT ERROR:', error);
      await this.showToast(this.getErrorMessage(error), 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  goBack() {
    this.router.navigate(['/tabs/tab1']);
  }

  private async loadExerciseById(exerciseId: string) {
    const { data, error } = await this.supabase.client
      .from('exercises')
      .select('id, name')
      .eq('id', exerciseId)
      .maybeSingle();

    if (error || !data) {
      await this.showToast('Exercise not found', 'danger');
      this.router.navigate(['/tabs/tab1']);
      return;
    }

    this.exerciseId = data.id;
    this.exerciseName = data.name;
  }

  private async loadExerciseByName(exerciseName: string) {
    const { data, error } = await this.supabase.client
      .from('exercises')
      .select('id, name')
      .eq('name', exerciseName)
      .maybeSingle();

    if (error || !data) {
      await this.showToast('Exercise not found', 'danger');
      this.router.navigate(['/tabs/tab1']);
      return;
    }

    this.exerciseId = data.id;
    this.exerciseName = data.name;
  }

  private getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      const maybeMessage = (error as { message?: unknown }).message;
      if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
        return maybeMessage;
      }
    }

    return 'Something went wrong while saving the workout';
  }

  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'warning'
  ) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2200,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
