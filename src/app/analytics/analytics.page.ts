import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { Chart } from 'chart.js/auto';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../shared/services/supabase.service';
import { Database } from '../shared/types/supabase.types';

type ExerciseOption = Pick<Database['public']['Tables']['exercises']['Row'], 'id' | 'name'>;

type ExerciseLogRow = Pick<
  Database['public']['Tables']['exercise_logs']['Row'],
  'log_date' | 'reps' | 'weight'
>;

type BodyWeightLogRow = Pick<
  Database['public']['Tables']['body_weight_logs']['Row'],
  'logged_on' | 'weight'
>;

interface ExerciseChartPayload {
  labels: string[];
  maxWeightData: number[];
  volumeData: number[];
}

interface WeightChartPayload {
  labels: string[];
  weightData: number[];
}

@Component({
  selector: 'app-analytics',
  standalone: false,
  templateUrl: './analytics.page.html',
  styleUrls: ['./analytics.page.scss'],
})
export class AnalyticsPage implements AfterViewInit, OnDestroy {
  @ViewChild('exerciseChartCanvas')
  private exerciseChartCanvas?: ElementRef<HTMLCanvasElement>;

  @ViewChild('weightChartCanvas')
  private weightChartCanvas?: ElementRef<HTMLCanvasElement>;

  loading = false;
  errorMessage = '';

  readonly rangeOptions = [7, 30, 90];
  selectedFilterDays = 7;

  exercises: ExerciseOption[] = [];
  selectedExerciseId: string | null = null;

  hasExerciseData = false;
  hasWeightData = false;

  private userId = '';
  private viewInitialized = false;
  private exerciseChart: Chart | null = null;
  private weightChart: Chart | null = null;
  private exerciseChartPayload: ExerciseChartPayload | null = null;
  private weightChartPayload: WeightChartPayload | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly supabase: SupabaseService,
    private readonly alertController: AlertController,
    private readonly loadingCtrl: LoadingController,
    private readonly toastCtrl: ToastController
  ) {}

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.renderBufferedCharts();
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  async ionViewWillEnter(): Promise<void> {
    await this.initializeAnalytics();
  }

  async setFilter(days: number): Promise<void> {
    if (this.selectedFilterDays === days) {
      return;
    }

    this.selectedFilterDays = days;
    await this.loadAnalytics();
  }

  async onExerciseChange(exerciseId: string | null): Promise<void> {
    this.selectedExerciseId = exerciseId;
    await this.loadAnalytics();
  }

  async openExerciseInfo(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Exercise Metrics Explained',
      message: `
        <b>Max Weight (lbs)</b><br>
        The heaviest weight you lifted for this exercise on a given day.
        This shows your strength progression.<br><br>

        <b>Total Workload (lbs)</b><br>
        Calculated as weight x reps for all sets combined.
        This shows total training effort and muscle stimulus.<br><br>

        <b>How to read this chart:</b><br>
        - If Max Weight increases, you are getting stronger.<br>
        - If Total Workload increases, you are increasing overall training volume.<br>
        - If both increase, progress is excellent.
      `,
      buttons: ['Got it'],
      mode: 'ios',
      cssClass: 'metric-alert',
    });

    await alert.present();
  }

  async openBodyWeightInfo(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Body Weight Progress',
      message: `
        This chart shows your daily body weight in pounds (lbs).<br><br>
        Use this to compare weight changes alongside strength progression.<br><br>
        - If strength increases and body weight stays stable, this suggests lean gains.<br>
        - If strength increases and body weight increases, this suggests muscle gain.<br>
        - If body weight decreases while strength is maintained, this suggests fat-loss progress.
      `,
      buttons: ['Understood'],
      mode: 'ios',
      cssClass: 'metric-alert',
    });

    await alert.present();
  }

  private async initializeAnalytics(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';

    const loading = await this.loadingCtrl.create({
      message: 'Loading analytics...',
      spinner: 'crescent',
      mode: 'ios',
    });
    await loading.present();

    try {
      await this.ensureAuthenticatedUser();
      await this.loadExercises();
      if (this.exercises.length > 0) {
        this.selectedExerciseId = this.exercises[0].id;
      }
      await this.loadAnalytics();
    } catch (error) {
      console.error('INITIAL ANALYTICS ERROR:', error);
      this.errorMessage = this.getErrorMessage(error);
      await this.showToast(this.errorMessage, 'danger');
    } finally {
      this.loading = false;
      await loading.dismiss();
    }
  }

  async loadAnalytics(): Promise<void> {
    this.errorMessage = '';

    if (!this.userId) {
      await this.ensureAuthenticatedUser();
    }

    const filterDate = this.getFilterDateString(this.selectedFilterDays);

    if (!this.selectedExerciseId) {
      this.hasExerciseData = false;
      this.exerciseChartPayload = null;
      this.destroyExerciseChart();
      await this.loadBodyWeightProgress(filterDate);
      return;
    }

    try {
      await Promise.all([
        this.loadExerciseProgress(filterDate),
        this.loadBodyWeightProgress(filterDate),
      ]);
    } catch (error) {
      console.error('LOAD ANALYTICS ERROR:', error);
      this.errorMessage = this.getErrorMessage(error);
      await this.showToast(this.errorMessage, 'danger');
    }
  }

  private async loadExercises(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('exercises')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    this.exercises = (data ?? []) as ExerciseOption[];

    if (this.exercises.length === 0) {
      this.selectedExerciseId = null;
      return;
    }
  }

  private async loadExerciseProgress(filterDate: string): Promise<void> {
    if (!this.selectedExerciseId) {
      this.hasExerciseData = false;
      this.exerciseChartPayload = null;
      this.destroyExerciseChart();
      return;
    }

    const { data, error } = await this.supabase.client
      .from('exercise_logs')
      .select('log_date, reps, weight')
      .eq('user_id', this.userId)
      .eq('exercise_id', this.selectedExerciseId)
      .gte('log_date', filterDate)
      .order('log_date', { ascending: true });

    if (error) {
      throw error;
    }

    const logRows = (data ?? []) as ExerciseLogRow[];
    const aggregateMap = new Map<string, { maxWeight: number; volume: number }>();

    logRows.forEach((row) => {
      const existing = aggregateMap.get(row.log_date) ?? {
        maxWeight: 0,
        volume: 0,
      };

      existing.maxWeight = Math.max(existing.maxWeight, Number(row.weight));
      existing.volume += Number(row.weight) * Number(row.reps);
      aggregateMap.set(row.log_date, existing);
    });

    const sortedDates = Array.from(aggregateMap.keys()).sort((a, b) =>
      a > b ? 1 : -1
    );

    this.exerciseChartPayload = {
      labels: sortedDates.map((date) => this.formatShortDate(date)),
      maxWeightData: sortedDates.map((date) => aggregateMap.get(date)?.maxWeight ?? 0),
      volumeData: sortedDates.map((date) => aggregateMap.get(date)?.volume ?? 0),
    };

    this.hasExerciseData = this.exerciseChartPayload.labels.length > 0;
    this.renderExerciseChart();
  }

  private async loadBodyWeightProgress(filterDate: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('body_weight_logs')
      .select('logged_on, weight')
      .eq('user_id', this.userId)
      .gte('logged_on', filterDate)
      .order('logged_on', { ascending: true });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as BodyWeightLogRow[];
    this.weightChartPayload = {
      labels: rows.map((row) => this.formatShortDate(row.logged_on)),
      weightData: rows.map((row) => Number(row.weight)),
    };

    this.hasWeightData = this.weightChartPayload.labels.length > 0;
    this.renderWeightChart();
  }

  private renderExerciseChart(): void {
    if (!this.viewInitialized || !this.exerciseChartPayload) {
      return;
    }

    const canvas = this.exerciseChartCanvas?.nativeElement;
    if (!canvas) {
      return;
    }

    this.destroyExerciseChart();

    this.exerciseChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: this.exerciseChartPayload.labels,
        datasets: [
          {
            label: 'Max Weight (lbs)',
            data: this.exerciseChartPayload.maxWeightData,
            borderColor: '#2dd36f',
            backgroundColor: 'rgba(45, 211, 111, 0.2)',
            pointRadius: 3,
            tension: 0.25,
            yAxisID: 'y',
          },
          {
            label: 'Total Workload (lbs)',
            data: this.exerciseChartPayload.volumeData,
            borderColor: '#5aa9ff',
            backgroundColor: 'rgba(90, 169, 255, 0.2)',
            pointRadius: 3,
            tension: 0.25,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#d9e2ef',
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#9eb0c8' },
            grid: { color: 'rgba(255,255,255,0.08)' },
          },
          y: {
            ticks: { color: '#9eb0c8' },
            grid: { color: 'rgba(255,255,255,0.08)' },
          },
          y1: {
            position: 'right',
            ticks: { color: '#9eb0c8' },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  private renderWeightChart(): void {
    if (!this.viewInitialized || !this.weightChartPayload) {
      return;
    }

    const canvas = this.weightChartCanvas?.nativeElement;
    if (!canvas) {
      return;
    }

    this.destroyWeightChart();

    this.weightChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: this.weightChartPayload.labels,
        datasets: [
          {
            label: 'Body Weight (lbs)',
            data: this.weightChartPayload.weightData,
            borderColor: '#ffd166',
            backgroundColor: 'rgba(255, 209, 102, 0.2)',
            pointRadius: 3,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#d9e2ef',
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#9eb0c8' },
            grid: { color: 'rgba(255,255,255,0.08)' },
          },
          y: {
            ticks: { color: '#9eb0c8' },
            grid: { color: 'rgba(255,255,255,0.08)' },
          },
        },
      },
    });
  }

  private renderBufferedCharts(): void {
    this.renderExerciseChart();
    this.renderWeightChart();
  }

  private async ensureAuthenticatedUser(): Promise<void> {
    const user = await this.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    this.userId = user.id;
  }

  private getFilterDateString(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatShortDate(dateValue: string): string {
    return new Date(`${dateValue}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  private destroyExerciseChart(): void {
    if (this.exerciseChart) {
      this.exerciseChart.destroy();
      this.exerciseChart = null;
    }
  }

  private destroyWeightChart(): void {
    if (this.weightChart) {
      this.weightChart.destroy();
      this.weightChart = null;
    }
  }

  private destroyCharts(): void {
    this.destroyExerciseChart();
    this.destroyWeightChart();
  }

  private getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return 'Unable to load analytics.';
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

