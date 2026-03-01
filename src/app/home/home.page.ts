import { Component } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';

import { SupabaseService } from '../shared/services/supabase.service';
import { AuthService } from '../auth/auth.service';

interface WorkoutSplit {
  id: string;
  split_label: string;
  day_of_week: number;
}

interface Exercise {
  id: string;
  name: string;
  body_part: string | null;
  media_path: string | null;
  instructions: string | null;
  order_index: number;
}

interface CompletionRow {
  id: string;
  exercise_id: string;
}

interface SplitExerciseRow {
  order_index: number;
  exercises:
    | {
        id: string;
        name: string;
        body_part: string | null;
        media_path: string | null;
        instructions: string | null;
      }
    | {
        id: string;
        name: string;
        body_part: string | null;
        media_path: string | null;
        instructions: string | null;
      }[]
    | null;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage {
  loading = false;
  errorMessage = '';

  isRestDay = false;
  splitName = '';
  exercises: Exercise[] = [];

  private userId: string | null = null;
  private todayDate = '';
  completedMap: Record<string, boolean> = {};
  private pendingExerciseIds = new Set<string>();

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService,
    private toastCtrl: ToastController
  ) {}

  ionViewWillEnter() {
    this.loadHomeData();
  }

  async loadHomeData() {
    this.loading = true;
    this.errorMessage = '';
    this.exercises = [];
    this.completedMap = {};
    this.isRestDay = false;
    this.splitName = '';
    this.todayDate = this.getLocalDateString(new Date());

    try {
      await this.ensureUser();
      const split = await this.fetchTodaySplit();

      if (!split) {
        this.isRestDay = true;
        return;
      }

      this.splitName = split.split_label;
      this.exercises = await this.fetchExercisesForSplit(split.id);
      await this.fetchTodayCompletionStatus();
    } catch (error: unknown) {
      console.error('HOME LOAD ERROR:', error);
      this.errorMessage = this.getErrorMessage(error, 'Failed to load home data');
      await this.presentToast(this.errorMessage, 'danger');
    } finally {
      this.loading = false;
    }
  }

  async onCompletionToggle(exerciseId: string, completed: boolean) {
    if (!this.userId || this.pendingExerciseIds.has(exerciseId)) {
      return;
    }

    const previousState = !!this.completedMap[exerciseId];
    if (completed === previousState) {
      return;
    }

    this.pendingExerciseIds.add(exerciseId);
    this.completedMap[exerciseId] = completed;

    try {
      if (completed) {
        const { error } = await this.supabase.client
          .from('exercise_completion')
          .upsert(
            {
              user_id: this.userId,
              exercise_id: exerciseId,
              completed_on: this.todayDate,
            },
            {
              onConflict: 'user_id,exercise_id,completed_on',
              ignoreDuplicates: true,
            }
          );

        if (error) {
          throw error;
        }

        await this.presentToast('Marked complete', 'success');
      } else {
        const { error } = await this.supabase.client
          .from('exercise_completion')
          .delete()
          .eq('user_id', this.userId)
          .eq('exercise_id', exerciseId)
          .eq('completed_on', this.todayDate);

        if (error) {
          throw error;
        }

        await this.presentToast('Marked incomplete', 'success');
      }
    } catch (error: unknown) {
      console.error('COMPLETION TOGGLE ERROR:', error);
      this.completedMap[exerciseId] = previousState;
      await this.presentToast('Could not update completion status', 'danger');
    } finally {
      this.pendingExerciseIds.delete(exerciseId);
    }
  }

  isCompleted(exerciseId: string): boolean {
    return !!this.completedMap[exerciseId];
  }

  isTogglePending(exerciseId: string): boolean {
    return this.pendingExerciseIds.has(exerciseId);
  }

  trackByExercise(_: number, exercise: Exercise): string {
    return exercise.id;
  }

  private async ensureUser() {
    const user = await this.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    this.userId = user.id;
  }

  private async fetchTodaySplit(): Promise<WorkoutSplit | null> {
    const todayDayOfWeek = new Date().getDay();

    const { data, error } = await this.supabase.client
      .from('workout_splits')
      .select('id, split_label, day_of_week')
      .eq('day_of_week', todayDayOfWeek)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  private async fetchExercisesForSplit(splitId: string): Promise<Exercise[]> {
    const { data, error } = await this.supabase.client
      .from('split_exercises')
      .select(`
        order_index,
        exercises (
          id,
          name,
          body_part,
          media_path,
          instructions
        )
      `)
      .eq('split_id', splitId)
      .order('order_index', { ascending: true });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as SplitExerciseRow[];

    return rows
      .map(row => {
        if (!row.exercises) {
          return null;
        }

        const exercise = Array.isArray(row.exercises)
          ? row.exercises[0]
          : row.exercises;

        if (!exercise) {
          return null;
        }

        return {
          id: exercise.id,
          name: exercise.name,
          body_part: exercise.body_part,
          media_path: exercise.media_path,
          instructions: exercise.instructions,
          order_index: row.order_index,
        };
      })
      .filter((exercise): exercise is Exercise => !!exercise);
  }

  private async fetchTodayCompletionStatus() {
    if (!this.userId) {
      return;
    }

    this.completedMap = this.exercises.reduce<Record<string, boolean>>(
      (map, exercise) => {
        map[exercise.id] = false;
        return map;
      },
      {}
    );

    if (this.exercises.length === 0) {
      return;
    }

    const exerciseIds = this.exercises.map((exercise) => exercise.id);
    const { data, error } = await this.supabase.client
      .from('exercise_completion')
      .select('id, exercise_id')
      .eq('user_id', this.userId)
      .eq('completed_on', this.todayDate)
      .in('exercise_id', exerciseIds);

    if (error) {
      throw error;
    }

    const completionRows = (data ?? []) as CompletionRow[];
    completionRows.forEach((row) => {
      this.completedMap[row.exercise_id] = true;
    });
  }

  private getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error && typeof error === 'object' && 'message' in error) {
      const maybeMessage = (error as { message?: unknown }).message;
      if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
        return maybeMessage;
      }
    }

    return fallback;
  }

  private async presentToast(
    message: string,
    color: 'success' | 'danger' | 'warning' | 'primary'
  ) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2200,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
