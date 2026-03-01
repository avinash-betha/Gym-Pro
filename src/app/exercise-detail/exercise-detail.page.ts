import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  IonicModule,
  LoadingController,
  ToastController,
} from '@ionic/angular';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../shared/services/supabase.service';
import { Database } from '../shared/types/supabase.types';

type ExerciseDetailRow = Pick<
  Database['public']['Tables']['exercises']['Row'],
  'id' | 'name' | 'body_part' | 'media_path' | 'instructions'
>;

type ExerciseLogRow = Pick<
  Database['public']['Tables']['exercise_logs']['Row'],
  'id' | 'reps' | 'weight'
>;

type SegmentValue = 'instructions' | 'logs';

interface InputSet {
  reps: number | null;
  weight: number | null;
}

interface LoggedSet {
  id: string;
  reps: number;
  weight: number;
  isEditing?: boolean;
}

@Component({
  selector: 'app-exercise-detail',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterModule],
  templateUrl: './exercise-detail.page.html',
  styleUrls: ['./exercise-detail.page.scss'],
})
export class ExerciseDetailPage {
  exercise: ExerciseDetailRow | null = null;
  activeSegment: SegmentValue = 'instructions';

  loading = false;
  savingWorkout = false;

  isCompletedToday = false;
  inputSets: InputSet[] = [];
  loggedSets: LoggedSet[] = [];
  deletingLoggedSetIds = new Set<string>();

  private exerciseId = '';
  private userId = '';
  private todayDate = '';
  private loggedSetSnapshots: Record<string, { reps: number; weight: number }> = {};
  private pendingLoggedUpdateIds = new Set<string>();
  private pendingLoggedDeleteIds = new Set<string>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auth: AuthService,
    private readonly supabase: SupabaseService,
    private readonly toastCtrl: ToastController,
    private readonly loadingCtrl: LoadingController
  ) {}

  ionViewWillEnter(): void {
    void this.initializePage();
  }

  addSet(): void {
    this.inputSets = [
      ...this.inputSets,
      { reps: null, weight: null },
    ];
  }

  removeInputSet(index: number): void {
    this.inputSets = this.inputSets.filter((_, itemIndex) => itemIndex !== index);
  }

  onLoggedSetBlur(set: LoggedSet): void {
    void this.updateLoggedSet(set);
  }

  isLoggedSetBusy(id: string): boolean {
    return this.pendingLoggedDeleteIds.has(id) || this.pendingLoggedUpdateIds.has(id);
  }

  isLoggedSetDeleting(id: string): boolean {
    return this.deletingLoggedSetIds.has(id);
  }

  hasValidSets(): boolean {
    return this.inputSets.some((set) =>
      set.reps !== null &&
      set.weight !== null &&
      Number.isFinite(set.reps) &&
      Number.isFinite(set.weight) &&
      set.reps > 0 &&
      set.weight >= 0
    );
  }

  async saveWorkout(): Promise<void> {
    if (this.savingWorkout || !this.userId || !this.exerciseId) {
      return;
    }

    const validSets = this.inputSets.filter(
      (set) =>
        set.reps !== null &&
        set.weight !== null &&
        Number(set.reps) > 0 &&
        Number(set.weight) >= 0
    );

    if (validSets.length === 0) {
      await this.showToast('Enter at least one valid set', 'warning');
      return;
    }

    this.savingWorkout = true;
    const loading = await this.loadingCtrl.create({
      message: 'Saving workout...',
      spinner: 'crescent',
      mode: 'ios',
    });
    await loading.present();

    try {
      for (const set of validSets) {
        const { error } = await this.supabase.client.from('exercise_logs').insert({
          user_id: this.userId,
          exercise_id: this.exerciseId,
          reps: Number(set.reps),
          weight: Number(set.weight),
          log_date: this.todayDate,
        });

        if (error) {
          throw error;
        }
      }

      await this.markCompletedFromWorkout();
      this.inputSets = [];
      await this.loadLoggedSets();

      await this.showToast('Workout saved', 'success');
    } catch (error) {
      console.error('SAVE WORKOUT ERROR:', error);
      await this.showToast(this.getErrorMessage(error), 'danger');
    } finally {
      this.savingWorkout = false;
      await loading.dismiss();
    }
  }

  isVideoMedia(path: string | null | undefined): boolean {
    if (!path) {
      return false;
    }

    const normalized = path.split('?')[0].split('#')[0].toLowerCase();
    return normalized.endsWith('.mp4');
  }

  formatWeight(weight: number): string {
    return Number.isInteger(weight) ? `${weight}` : weight.toFixed(1);
  }

  async updateLoggedSet(set: LoggedSet): Promise<void> {
    if (!this.userId || !this.exerciseId) {
      return;
    }

    if (
      this.pendingLoggedDeleteIds.has(set.id) ||
      this.pendingLoggedUpdateIds.has(set.id)
    ) {
      return;
    }

    const snapshot = this.loggedSetSnapshots[set.id] ?? {
      reps: set.reps,
      weight: set.weight,
    };

    const reps = Number(set.reps);
    const weight = Number(set.weight);

    if (!Number.isFinite(reps) || !Number.isFinite(weight) || reps <= 0 || weight < 0) {
      set.reps = snapshot.reps;
      set.weight = snapshot.weight;
      await this.showToast('Enter valid reps and weight', 'warning');
      return;
    }

    if (snapshot.reps === reps && snapshot.weight === weight) {
      return;
    }

    this.pendingLoggedUpdateIds.add(set.id);
    set.isEditing = true;

    try {
      const { error } = await this.supabase.client
        .from('exercise_logs')
        .update({
          reps,
          weight,
        })
        .eq('id', set.id)
        .eq('user_id', this.userId)
        .eq('exercise_id', this.exerciseId)
        .eq('log_date', this.todayDate);

      if (error) {
        throw error;
      }

      set.reps = reps;
      set.weight = weight;
      this.loggedSetSnapshots[set.id] = {
        reps,
        weight,
      };

      await this.showToast('Set updated', 'success');
    } catch (error) {
      console.error('UPDATE LOGGED SET ERROR:', error);
      set.reps = snapshot.reps;
      set.weight = snapshot.weight;
      await this.showToast(this.getErrorMessage(error), 'danger');
    } finally {
      set.isEditing = false;
      this.pendingLoggedUpdateIds.delete(set.id);
    }
  }

  async deleteLoggedSet(id: string): Promise<void> {
    if (!this.userId || !this.exerciseId || this.pendingLoggedDeleteIds.has(id)) {
      return;
    }

    this.pendingLoggedDeleteIds.add(id);
    this.deletingLoggedSetIds.add(id);

    try {
      const { error: deleteError } = await this.supabase.client
        .from('exercise_logs')
        .delete()
        .eq('id', id)
        .eq('user_id', this.userId);

      if (deleteError) {
        console.error('Delete failed:', deleteError);
        await this.showToast('Failed to delete set', 'danger');
        return;
      }

      const { data: verifyData, error: verifyError } = await this.supabase.client
        .from('exercise_logs')
        .select('id')
        .eq('id', id)
        .eq('user_id', this.userId)
        .maybeSingle();

      if (verifyError) {
        console.error('Delete verification failed:', verifyError);
        await this.showToast('Failed to verify deletion', 'danger');
        return;
      }

      if (verifyData) {
        console.error('Delete failed: row still exists. Check RLS delete policy for exercise_logs.');
        await this.showToast('Failed to delete set', 'danger');
        return;
      }

      await this.waitForAnimation(160);
      this.loggedSets = this.loggedSets.filter((set) => set.id !== id);
      delete this.loggedSetSnapshots[id];

      if (this.loggedSets.length === 0) {
        const completionDate = new Date().toISOString().split('T')[0];
        const { error: completionError } = await this.supabase.client
          .from('exercise_completion')
          .delete()
          .eq('user_id', this.userId)
          .eq('exercise_id', this.exerciseId)
          .eq('completed_on', completionDate);

        if (completionError) {
          throw completionError;
        }

        this.isCompletedToday = false;
      }

      await this.showToast('Set deleted', 'success');
    } catch (error) {
      console.error('DELETE LOGGED SET ERROR:', error);
      await this.showToast(this.getErrorMessage(error), 'danger');
    } finally {
      this.deletingLoggedSetIds.delete(id);
      this.pendingLoggedDeleteIds.delete(id);
    }
  }

  private async initializePage(): Promise<void> {
    const routeExerciseId = this.route.snapshot.paramMap.get('id')?.trim() ?? '';

    if (!routeExerciseId) {
      await this.showToast('Exercise not found', 'danger');
      await this.router.navigate(['/tabs/tab1'], { replaceUrl: true });
      return;
    }

    this.exerciseId = routeExerciseId;
    this.todayDate = this.getLocalDateString(new Date());
    this.activeSegment = 'instructions';
    this.inputSets = [];
    this.loggedSets = [];
    this.deletingLoggedSetIds.clear();
    this.pendingLoggedUpdateIds.clear();
    this.pendingLoggedDeleteIds.clear();
    this.loggedSetSnapshots = {};
    this.isCompletedToday = false;

    const loading = await this.loadingCtrl.create({
      message: 'Loading exercise...',
      spinner: 'crescent',
      mode: 'ios',
    });

    this.loading = true;
    await loading.present();

    try {
      const user = await this.auth.getUser();
      if (!user) {
        await this.router.navigate(['/login'], { replaceUrl: true });
        return;
      }

      this.userId = user.id;

      await this.loadExercise();
      await Promise.all([this.loadLoggedSets(), this.checkCompletion()]);
    } catch (error) {
      console.error('EXERCISE DETAIL INIT ERROR:', error);
      await this.showToast(this.getErrorMessage(error), 'danger');
      await this.router.navigate(['/tabs/tab1'], { replaceUrl: true });
    } finally {
      this.loading = false;
      await loading.dismiss();
    }
  }

  private async loadExercise(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('exercises')
      .select('id, name, body_part, media_path, instructions')
      .eq('id', this.exerciseId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Exercise not found');
    }

    this.exercise = data;
  }

  async loadLoggedSets(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('exercise_logs')
      .select('id, reps, weight')
      .eq('user_id', this.userId)
      .eq('exercise_id', this.exerciseId)
      .eq('log_date', this.todayDate)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as ExerciseLogRow[];
    this.loggedSetSnapshots = {};
    this.loggedSets = rows.map((row) => ({
      id: row.id,
      reps: row.reps,
      weight: Number(row.weight),
    }));

    this.loggedSets.forEach((row) => {
      this.loggedSetSnapshots[row.id] = {
        reps: row.reps,
        weight: row.weight,
      };
    });
  }

  private async checkCompletion(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('exercise_completion')
      .select('id')
      .eq('user_id', this.userId)
      .eq('exercise_id', this.exerciseId)
      .eq('completed_on', this.todayDate)
      .maybeSingle();

    if (error) {
      throw error;
    }

    this.isCompletedToday = !!data;
  }

  private async markCompletedFromWorkout(): Promise<void> {
    const { error } = await this.supabase.client
      .from('exercise_completion')
      .upsert(
        {
          user_id: this.userId,
          exercise_id: this.exerciseId,
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

    this.isCompletedToday = true;
  }

  private async clearCompletionForToday(): Promise<void> {
    const { error } = await this.supabase.client
      .from('exercise_completion')
      .delete()
      .eq('user_id', this.userId)
      .eq('exercise_id', this.exerciseId)
      .eq('completed_on', this.todayDate);

    if (error) {
      throw error;
    }

    this.isCompletedToday = false;
  }

  private async waitForAnimation(durationMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), durationMs);
    });
  }

  private getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return 'Something went wrong. Please try again.';
  }

  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'warning'
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2200,
      color,
      position: 'bottom',
      mode: 'ios',
    });
    await toast.present();
  }
}
