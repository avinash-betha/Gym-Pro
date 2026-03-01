import { Component } from '@angular/core';
import { LoadingController, ToastController } from '@ionic/angular';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../shared/services/supabase.service';
import { Database } from '../shared/types/supabase.types';

type HistoryLogSummaryRow = Pick<
  Database['public']['Tables']['exercise_logs']['Row'],
  'log_date' | 'reps' | 'weight'
>;

type HistoryCompletionRow = Pick<
  Database['public']['Tables']['exercise_completion']['Row'],
  'completed_on'
>;

type ExerciseNameRow = Pick<Database['public']['Tables']['exercises']['Row'], 'name'>;

interface HistoryLogDetailRow {
  reps: number;
  weight: number;
  created_at: string;
  exercises: ExerciseNameRow | ExerciseNameRow[] | null;
}

interface HistorySet {
  reps: number;
  weight: number;
}

interface HistoryExerciseGroup {
  exerciseName: string;
  sets: HistorySet[];
}

interface HistoryDaySummary {
  logDate: string;
  setsCount: number;
  totalVolume: number;
  completed: boolean;
  detailsLoaded: boolean;
  detailsLoading: boolean;
  exerciseGroups: HistoryExerciseGroup[];
}

@Component({
  selector: 'app-history',
  standalone: false,
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
})
export class HistoryPage {
  loading = false;
  errorMessage = '';
  historyDays: HistoryDaySummary[] = [];

  private userId = '';

  constructor(
    private readonly auth: AuthService,
    private readonly supabase: SupabaseService,
    private readonly loadingCtrl: LoadingController,
    private readonly toastCtrl: ToastController
  ) {}

  ionViewWillEnter(): void {
    void this.loadWorkoutDays();
  }

  async loadWorkoutDays(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    this.historyDays = [];

    const loading = await this.loadingCtrl.create({
      message: 'Loading history...',
      spinner: 'crescent',
      mode: 'ios',
    });
    await loading.present();

    try {
      await this.ensureAuthenticatedUser();

      const { data: logsData, error: logsError } = await this.supabase.client
        .from('exercise_logs')
        .select('log_date, reps, weight')
        .eq('user_id', this.userId)
        .order('log_date', { ascending: false });

      if (logsError) {
        throw logsError;
      }

      const logs = (logsData ?? []) as HistoryLogSummaryRow[];
      if (logs.length === 0) {
        this.historyDays = [];
        return;
      }

      const aggregateByDate = new Map<
        string,
        { setsCount: number; totalVolume: number }
      >();

      logs.forEach((log) => {
        const existing = aggregateByDate.get(log.log_date) ?? {
          setsCount: 0,
          totalVolume: 0,
        };

        existing.setsCount += 1;
        existing.totalVolume += Number(log.weight) * Number(log.reps);
        aggregateByDate.set(log.log_date, existing);
      });

      const dates = Array.from(aggregateByDate.keys()).sort((a, b) =>
        a > b ? -1 : 1
      );

      const { data: completionData, error: completionError } =
        await this.supabase.client
          .from('exercise_completion')
          .select('completed_on')
          .eq('user_id', this.userId)
          .in('completed_on', dates);

      if (completionError) {
        throw completionError;
      }

      const completionRows = (completionData ?? []) as HistoryCompletionRow[];
      const completionDates = new Set(
        completionRows.map((row) => row.completed_on)
      );

      this.historyDays = dates.map((date) => {
        const aggregate = aggregateByDate.get(date);
        return {
          logDate: date,
          setsCount: aggregate?.setsCount ?? 0,
          totalVolume: aggregate?.totalVolume ?? 0,
          completed: completionDates.has(date),
          detailsLoaded: false,
          detailsLoading: false,
          exerciseGroups: [],
        };
      });
    } catch (error) {
      console.error('LOAD HISTORY ERROR:', error);
      this.errorMessage = this.getErrorMessage(error);
      await this.showToast(this.errorMessage, 'danger');
    } finally {
      this.loading = false;
      await loading.dismiss();
    }
  }

  onDayHeaderClick(day: HistoryDaySummary): void {
    if (day.detailsLoaded || day.detailsLoading) {
      return;
    }

    void this.loadDayDetails(day);
  }

  trackByDay(_: number, day: HistoryDaySummary): string {
    return day.logDate;
  }

  trackByExerciseGroup(_: number, group: HistoryExerciseGroup): string {
    return group.exerciseName;
  }

  formatDate(dateValue: string): string {
    return new Date(`${dateValue}T00:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  formatVolume(volume: number): string {
    return Number.isInteger(volume) ? `${volume}` : volume.toFixed(1);
  }

  private async loadDayDetails(day: HistoryDaySummary): Promise<void> {
    day.detailsLoading = true;

    try {
      const { data, error } = await this.supabase.client
        .from('exercise_logs')
        .select(
          `
          reps,
          weight,
          created_at,
          exercises (
            name
          )
        `
        )
        .eq('user_id', this.userId)
        .eq('log_date', day.logDate)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      const detailRows = (data ?? []) as HistoryLogDetailRow[];
      const grouped = new Map<string, HistoryExerciseGroup>();

      detailRows.forEach((row) => {
        const exerciseRelation = Array.isArray(row.exercises)
          ? row.exercises[0]
          : row.exercises;
        const exerciseName = exerciseRelation?.name ?? 'Unknown Exercise';

        const existingGroup = grouped.get(exerciseName) ?? {
          exerciseName,
          sets: [],
        };

        existingGroup.sets.push({
          reps: row.reps,
          weight: Number(row.weight),
        });

        grouped.set(exerciseName, existingGroup);
      });

      day.exerciseGroups = Array.from(grouped.values());
      day.detailsLoaded = true;
    } catch (error) {
      console.error('LOAD DAY DETAILS ERROR:', error);
      await this.showToast(this.getErrorMessage(error), 'danger');
    } finally {
      day.detailsLoading = false;
    }
  }

  private async ensureAuthenticatedUser(): Promise<void> {
    const user = await this.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    this.userId = user.id;
  }

  private getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return 'Unable to load workout history.';
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
