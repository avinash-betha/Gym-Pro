import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  LoadingController,
  ToastController,
} from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../shared/services/supabase.service';

type AdminTab = 'splits' | 'exercises';
type MediaPreviewType = 'video' | 'image' | null;

interface DayOption {
  value: number;
  label: string;
}

interface SplitRow {
  id: string;
  split_label: string;
  day_of_week: number;
}

interface SplitEditor {
  id: string;
  splitLabel: string;
  dayOfWeek: number;
  draftLabel: string;
  draftDayOfWeek: number;
}

interface ExerciseRow {
  id: string;
  name: string;
  body_part: string | null;
  sort_order: number;
  media_path: string | null;
  instructions: string | null;
}

interface SplitExerciseRow {
  id: string;
  split_id: string;
  exercise_id: string;
  order_index: number;
}

interface ExerciseEditor {
  id: string;
  name: string;
  bodyPart: string;
  sortOrder: number;
  instructions: string;
  mediaPath: string | null;
  splitLinks: SplitExerciseRow[];
  draftSplitId: string | null;
  draftName: string;
  draftBodyPart: string;
  draftSortOrder: number;
  draftInstructions: string;
  pendingFile: File | null;
  pendingFileName: string;
  pendingPreviewUrl: string | null;
  pendingPreviewType: MediaPreviewType;
  removeExistingMedia: boolean;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
})
export class AdminPage implements OnDestroy {
  readonly dayOptions: DayOption[] = this.buildDayOptions();
  readonly acceptedMediaTypes = 'video/mp4,image/gif,image/jpeg,image/png';

  activeTab: AdminTab = 'splits';
  splits: SplitEditor[] = [];
  exercises: ExerciseEditor[] = [];

  newSplitLabel = '';
  newSplitDayOfWeek: number | null = null;

  newExerciseName = '';
  newExerciseBodyPart = '';
  newExerciseSortOrder = 0;
  newExerciseInstructions = '';
  newExerciseSplitId: string | null = null;
  newExerciseFile: File | null = null;
  newExerciseFileName = '';
  newExercisePreviewUrl: string | null = null;
  newExercisePreviewType: MediaPreviewType = null;

  splitPendingDelete: SplitEditor | null = null;
  splitPendingDeleteMappedCount = 0;
  exercisePendingDelete: ExerciseEditor | null = null;

  isLoading = false;
  private currentUserId: string | null = null;

  private readonly allowedMimeTypes = new Set([
    'video/mp4',
    'image/gif',
    'image/jpeg',
    'image/png',
  ]);

  private readonly allowedExtensions = new Set([
    'mp4',
    'gif',
    'jpg',
    'jpeg',
    'png',
  ]);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly toastCtrl: ToastController,
    private readonly loadingCtrl: LoadingController
  ) {}

  async ionViewWillEnter(): Promise<void> {
    const isAllowed = await this.ensureAdminAccess();
    if (!isAllowed) {
      return;
    }

    await this.runWithLoading('Loading admin panel...', async () => {
      await Promise.all([this.loadSplits(), this.loadExercises()]);
    });
  }

  ngOnDestroy(): void {
    this.releasePreviewUrl(this.newExercisePreviewUrl);
    this.exercises.forEach((exercise) =>
      this.releasePreviewUrl(exercise.pendingPreviewUrl)
    );
  }

  trackBySplitId(_index: number, split: SplitEditor): string {
    return split.id;
  }

  trackByExerciseId(_index: number, exercise: ExerciseEditor): string {
    return exercise.id;
  }

  async refreshAdminData(event?: Event): Promise<void> {
    try {
      await Promise.all([this.loadSplits(), this.loadExercises()]);
    } catch (error) {
      await this.showError(error);
    } finally {
      if (event) {
        (event.target as HTMLIonRefresherElement).complete();
      }
    }
  }

  async addSplit(): Promise<void> {
    const splitLabel = this.newSplitLabel.trim();
    const dayOfWeek = this.coerceDayOfWeek(this.newSplitDayOfWeek);

    if (!splitLabel) {
      await this.showToast('Split label is required.', 'warning');
      return;
    }

    if (dayOfWeek === null) {
      await this.showToast('Please choose a valid day of week.', 'warning');
      return;
    }

    if (this.hasDuplicateDay(dayOfWeek)) {
      await this.showToast('A split already exists for that day.', 'warning');
      return;
    }

    try {
      await this.runWithLoading('Creating split...', async () => {
        const { error } = await this.supabase.client.from('workout_splits').insert({
          split_label: splitLabel,
          day_of_week: dayOfWeek,
        });

        if (error) {
          throw error;
        }
      });

      this.newSplitLabel = '';
      this.newSplitDayOfWeek = null;
      await this.loadSplits();
      await this.showToast('Split created.', 'success');
    } catch (error) {
      await this.showError(error);
    }
  }

  async saveSplit(split: SplitEditor): Promise<void> {
    const splitLabel = split.draftLabel.trim();
    const dayOfWeek = this.coerceDayOfWeek(split.draftDayOfWeek);

    if (!splitLabel) {
      await this.showToast('Split label is required.', 'warning');
      return;
    }

    if (dayOfWeek === null) {
      await this.showToast('Please choose a valid day of week.', 'warning');
      return;
    }

    if (this.hasDuplicateDay(dayOfWeek, split.id)) {
      await this.showToast('Another split is already assigned to that day.', 'warning');
      return;
    }

    try {
      await this.runWithLoading('Saving split...', async () => {
        const { error } = await this.supabase.client
          .from('workout_splits')
          .update({
            split_label: splitLabel,
            day_of_week: dayOfWeek,
          })
          .eq('id', split.id);

        if (error) {
          throw error;
        }
      });

      await this.loadSplits();
      await this.showToast('Split updated.', 'success');
    } catch (error) {
      await this.showError(error);
    }
  }

  async openDeleteSplitConfirmation(split: SplitEditor): Promise<void> {
    try {
      await this.runWithLoading('Checking mapped exercises...', async () => {
        const { count, error } = await this.supabase.client
          .from('split_exercises')
          .select('id', { count: 'exact', head: true })
          .eq('split_id', split.id);

        if (error) {
          throw error;
        }

        this.splitPendingDeleteMappedCount = count ?? 0;
      });

      this.splitPendingDelete = split;
    } catch (error) {
      await this.showError(error);
    }
  }

  closeDeleteSplitConfirmation(): void {
    this.splitPendingDelete = null;
    this.splitPendingDeleteMappedCount = 0;
  }

  async confirmDeleteSplit(): Promise<void> {
    if (!this.splitPendingDelete) {
      return;
    }

    const splitId = this.splitPendingDelete.id;

    try {
      await this.runWithLoading('Deleting split...', async () => {
        const { error } = await this.supabase.client
          .from('workout_splits')
          .delete()
          .eq('id', splitId);

        if (error) {
          throw error;
        }
      });

      this.splitPendingDelete = null;
      this.splitPendingDeleteMappedCount = 0;
      await Promise.all([this.loadSplits(), this.loadExercises()]);
      await this.showToast('Split deleted.', 'success');
    } catch (error) {
      await this.showError(error);
    }
  }

  async addExercise(): Promise<void> {
    const name = this.newExerciseName.trim();
    const bodyPart = this.newExerciseBodyPart.trim();
    const instructions = this.newExerciseInstructions.trim();
    const sortOrder = this.coerceSortOrder(this.newExerciseSortOrder);
    const splitId = this.normalizeSplitSelection(this.newExerciseSplitId);

    if (!name) {
      await this.showToast('Exercise name is required.', 'warning');
      return;
    }

    if (!splitId) {
      await this.showToast('Please select a split.', 'warning');
      return;
    }

    let uploadedPath: string | null = null;

    try {
      await this.runWithLoading('Saving exercise...', async () => {
        let mediaPath: string | null = null;

        if (this.newExerciseFile) {
          const uploadResult = await this.uploadExerciseMedia(this.newExerciseFile);
          mediaPath = uploadResult.publicUrl;
          uploadedPath = uploadResult.storagePath;
        }

        const { data: exerciseInsert, error: insertError } = await this.supabase.client
          .from('exercises')
          .insert({
            name,
            body_part: bodyPart || null,
            sort_order: sortOrder,
            instructions: instructions || null,
            media_path: mediaPath,
          })
          .select('id')
          .single();

        if (insertError || !exerciseInsert) {
          throw insertError ?? new Error('Failed to create exercise.');
        }

        const { error: splitMapError } = await this.supabase.client
          .from('split_exercises')
          .insert({
            split_id: splitId,
            exercise_id: exerciseInsert.id,
            order_index: sortOrder,
          });

        if (splitMapError) {
          await this.supabase.client.from('exercises').delete().eq('id', exerciseInsert.id);
          throw splitMapError;
        }
      });

      this.resetNewExerciseForm();
      await this.loadExercises();
      await this.showToast('Exercise created.', 'success');
    } catch (error) {
      if (uploadedPath) {
        await this.removeStorageObject(uploadedPath);
      }

      await this.showError(error);
    }
  }

  async saveExercise(exercise: ExerciseEditor): Promise<void> {
    const name = exercise.draftName.trim();
    const bodyPart = exercise.draftBodyPart.trim();
    const instructions = exercise.draftInstructions.trim();
    const sortOrder = this.coerceSortOrder(exercise.draftSortOrder);
    const selectedSplitId = this.normalizeSplitSelection(exercise.draftSplitId);
    exercise.draftSplitId = selectedSplitId;

    if (!name) {
      await this.showToast('Exercise name is required.', 'warning');
      return;
    }

    const previousMediaPath = exercise.mediaPath;
    let uploadedPath: string | null = null;

    try {
      await this.runWithLoading('Updating exercise...', async () => {
        let nextMediaPath: string | null = previousMediaPath;

        if (exercise.pendingFile) {
          const uploadResult = await this.uploadExerciseMedia(exercise.pendingFile);
          nextMediaPath = uploadResult.publicUrl;
          uploadedPath = uploadResult.storagePath;
        } else if (exercise.removeExistingMedia) {
          nextMediaPath = null;
        }

        const { error: exerciseUpdateError } = await this.supabase.client
          .from('exercises')
          .update({
            name,
            body_part: bodyPart || null,
            sort_order: sortOrder,
            instructions: instructions || null,
            media_path: nextMediaPath,
          })
          .eq('id', exercise.id);

        if (exerciseUpdateError) {
          throw exerciseUpdateError;
        }

        await this.syncExerciseSplitMapping(
          exercise.id,
          selectedSplitId,
          sortOrder,
          exercise.splitLinks
        );

        const shouldDeleteOldMedia =
          (exercise.pendingFile || exercise.removeExistingMedia) && !!previousMediaPath;

        if (shouldDeleteOldMedia) {
          await this.removeStorageObjectByPublicUrl(previousMediaPath);
        }
      });

      await this.loadExercises();
      await this.showToast('Exercise updated.', 'success');
    } catch (error) {
      if (uploadedPath) {
        await this.removeStorageObject(uploadedPath);
      }

      await this.showError(error);
    }
  }

  openDeleteExerciseConfirmation(exercise: ExerciseEditor): void {
    this.exercisePendingDelete = exercise;
  }

  closeDeleteExerciseConfirmation(): void {
    this.exercisePendingDelete = null;
  }

  async confirmDeleteExercise(): Promise<void> {
    if (!this.exercisePendingDelete) {
      return;
    }

    const exerciseId = this.exercisePendingDelete.id;
    const mediaPath = this.exercisePendingDelete.mediaPath;

    try {
      await this.runWithLoading('Deleting exercise...', async () => {
        const { error: linkDeleteError } = await this.supabase.client
          .from('split_exercises')
          .delete()
          .eq('exercise_id', exerciseId);

        if (linkDeleteError) {
          throw linkDeleteError;
        }

        const { error: exerciseDeleteError } = await this.supabase.client
          .from('exercises')
          .delete()
          .eq('id', exerciseId);

        if (exerciseDeleteError) {
          throw exerciseDeleteError;
        }
      });

      this.exercisePendingDelete = null;
      await this.removeStorageObjectByPublicUrl(mediaPath);
      await this.loadExercises();
      await this.showToast('Exercise deleted.', 'success');
    } catch (error) {
      await this.showError(error);
    }
  }

  onNewExerciseMediaSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    if (!this.isAllowedMediaFile(file)) {
      void this.showToast('Only mp4, gif, jpg, and png files are allowed.', 'danger');
      return;
    }

    this.releasePreviewUrl(this.newExercisePreviewUrl);
    this.newExerciseFile = file;
    this.newExerciseFileName = file.name;
    this.newExercisePreviewUrl = URL.createObjectURL(file);
    this.newExercisePreviewType = this.detectMediaType(file.name, file.type);
  }

  removeNewExerciseSelectedMedia(): void {
    this.newExerciseFile = null;
    this.newExerciseFileName = '';
    this.newExercisePreviewType = null;
    this.releasePreviewUrl(this.newExercisePreviewUrl);
    this.newExercisePreviewUrl = null;
  }

  onExerciseMediaSelected(exercise: ExerciseEditor, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    if (!this.isAllowedMediaFile(file)) {
      void this.showToast('Only mp4, gif, jpg, and png files are allowed.', 'danger');
      return;
    }

    this.releasePreviewUrl(exercise.pendingPreviewUrl);
    exercise.pendingFile = file;
    exercise.pendingFileName = file.name;
    exercise.pendingPreviewUrl = URL.createObjectURL(file);
    exercise.pendingPreviewType = this.detectMediaType(file.name, file.type);
    exercise.removeExistingMedia = false;
  }

  removeExercisePendingMedia(exercise: ExerciseEditor): void {
    exercise.pendingFile = null;
    exercise.pendingFileName = '';
    exercise.pendingPreviewType = null;
    this.releasePreviewUrl(exercise.pendingPreviewUrl);
    exercise.pendingPreviewUrl = null;
  }

  markExerciseMediaForRemoval(exercise: ExerciseEditor): void {
    this.removeExercisePendingMedia(exercise);
    exercise.removeExistingMedia = true;
  }

  undoExerciseMediaRemoval(exercise: ExerciseEditor): void {
    exercise.removeExistingMedia = false;
  }

  getExercisePreviewUrl(exercise: ExerciseEditor): string | null {
    if (exercise.pendingPreviewUrl) {
      return exercise.pendingPreviewUrl;
    }

    if (exercise.removeExistingMedia) {
      return null;
    }

    return exercise.mediaPath;
  }

  isExercisePreviewVideo(exercise: ExerciseEditor): boolean {
    if (exercise.pendingPreviewType !== null) {
      return exercise.pendingPreviewType === 'video';
    }

    const previewUrl = this.getExercisePreviewUrl(exercise);
    return previewUrl ? this.isVideoAsset(previewUrl) : false;
  }

  isNewExercisePreviewVideo(): boolean {
    if (this.newExercisePreviewType !== null) {
      return this.newExercisePreviewType === 'video';
    }

    return this.newExercisePreviewUrl ? this.isVideoAsset(this.newExercisePreviewUrl) : false;
  }

  getSplitLabelById(splitId: string | null): string {
    if (!splitId) {
      return 'Not mapped';
    }

    const split = this.splits.find((item) => item.id === splitId);
    return split?.splitLabel ?? 'Not mapped';
  }

  getPrimarySplitId(exercise: ExerciseEditor): string | null {
    return exercise.splitLinks[0]?.split_id ?? null;
  }

  getDayLabel(dayOfWeek: number): string {
    const option = this.dayOptions.find((item) => item.value === dayOfWeek);
    return option?.label ?? `Day ${dayOfWeek}`;
  }

  coerceSortOrder(value: unknown): number {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    return Math.max(0, Math.trunc(numericValue));
  }

  coerceDayOfWeek(value: unknown): number | null {
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue < 0 || numericValue > 6) {
      return null;
    }

    return numericValue;
  }

  normalizeSplitSelection(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalizedValue = String(value).trim();
    if (!normalizedValue || normalizedValue === '__none__') {
      return null;
    }

    return normalizedValue;
  }

  private async ensureAdminAccess(): Promise<boolean> {
    const user = await this.authService.getUser();

    if (!user) {
      await this.router.navigate(['/login'], { replaceUrl: true });
      return false;
    }

    this.currentUserId = user.id;

    const role = await this.authService.getUserRole(user.id);
    if (role !== 'admin') {
      await this.router.navigate(['/tabs'], { replaceUrl: true });
      return false;
    }

    return true;
  }

  private async loadSplits(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('workout_splits')
      .select('id, split_label, day_of_week')
      .order('day_of_week', { ascending: true });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as SplitRow[];
    this.splits = rows.map((split) => ({
      id: split.id,
      splitLabel: split.split_label,
      dayOfWeek: split.day_of_week,
      draftLabel: split.split_label,
      draftDayOfWeek: split.day_of_week,
    }));
  }

  private async loadExercises(): Promise<void> {
    const [exerciseResult, splitLinksResult] = await Promise.all([
      this.supabase.client
        .from('exercises')
        .select('id, name, body_part, sort_order, media_path, instructions')
        .order('sort_order', { ascending: true }),
      this.supabase.client
        .from('split_exercises')
        .select('id, split_id, exercise_id, order_index'),
    ]);

    if (exerciseResult.error) {
      throw exerciseResult.error;
    }

    if (splitLinksResult.error) {
      throw splitLinksResult.error;
    }

    this.exercises.forEach((exercise) =>
      this.releasePreviewUrl(exercise.pendingPreviewUrl)
    );

    const linkRows = (splitLinksResult.data ?? []) as SplitExerciseRow[];
    const linksByExercise = new Map<string, SplitExerciseRow[]>();

    for (const link of linkRows) {
      const currentLinks = linksByExercise.get(link.exercise_id) ?? [];
      currentLinks.push(link);
      linksByExercise.set(link.exercise_id, currentLinks);
    }

    const exerciseRows = (exerciseResult.data ?? []) as ExerciseRow[];
    this.exercises = exerciseRows.map((exercise) => ({
      splitLinks: (linksByExercise.get(exercise.id) ?? []).sort(
        (a, b) => a.order_index - b.order_index
      ),
      draftSplitId: null,
      id: exercise.id,
      name: exercise.name,
      bodyPart: exercise.body_part ?? '',
      sortOrder: exercise.sort_order,
      instructions: exercise.instructions ?? '',
      mediaPath: exercise.media_path,
      draftName: exercise.name,
      draftBodyPart: exercise.body_part ?? '',
      draftSortOrder: exercise.sort_order,
      draftInstructions: exercise.instructions ?? '',
      pendingFile: null,
      pendingFileName: '',
      pendingPreviewUrl: null,
      pendingPreviewType: null,
      removeExistingMedia: false,
    })).map((exercise) => ({
      ...exercise,
      draftSplitId: exercise.splitLinks[0]?.split_id ?? null,
    }));
  }

  private async syncExerciseSplitMapping(
    exerciseId: string,
    splitId: string | null,
    orderIndex: number,
    existingLinks: SplitExerciseRow[]
  ): Promise<void> {
    if (splitId) {
      const existingLinkForSplit = existingLinks.find(
        (link) => link.split_id === splitId
      );
      const hasSingleMatchingLink =
        existingLinks.length === 1 && !!existingLinkForSplit;

      if (hasSingleMatchingLink && existingLinkForSplit) {
        const { error: updateMappingError } = await this.supabase.client
          .from('split_exercises')
          .update({ order_index: orderIndex })
          .eq('id', existingLinkForSplit.id);

        if (updateMappingError) {
          throw updateMappingError;
        }

        return;
      }

      if (existingLinks.length > 0) {
        const { error: clearMappingsError } = await this.supabase.client
          .from('split_exercises')
          .delete()
          .eq('exercise_id', exerciseId);

        if (clearMappingsError) {
          throw clearMappingsError;
        }
      }

      const { error: insertMappingError } = await this.supabase.client
        .from('split_exercises')
        .insert({
          split_id: splitId,
          exercise_id: exerciseId,
          order_index: orderIndex,
        });

      if (insertMappingError) {
        throw insertMappingError;
      }

      return;
    }

    if (existingLinks.length > 0) {
      const { error: deleteMappingError } = await this.supabase.client
        .from('split_exercises')
        .delete()
        .eq('exercise_id', exerciseId);

      if (deleteMappingError) {
        throw deleteMappingError;
      }
    }
  }

  private async uploadExerciseMedia(
    file: File
  ): Promise<{ storagePath: string; publicUrl: string }> {
    const extension = this.getFileExtension(file.name) ?? 'bin';
    const uniqueFileName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}.${extension}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from('exercise-media')
      .upload(uniqueFileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = this.supabase.client.storage
      .from('exercise-media')
      .getPublicUrl(uniqueFileName);

    return {
      storagePath: uniqueFileName,
      publicUrl: data.publicUrl,
    };
  }

  private async removeStorageObjectByPublicUrl(publicUrl: string | null): Promise<void> {
    const storagePath = this.getStoragePathFromPublicUrl(publicUrl);
    if (!storagePath) {
      return;
    }

    await this.removeStorageObject(storagePath);
  }

  private async removeStorageObject(storagePath: string): Promise<void> {
    const { error } = await this.supabase.client.storage
      .from('exercise-media')
      .remove([storagePath]);

    if (error) {
      console.error('MEDIA DELETE ERROR:', error);
    }
  }

  private getStoragePathFromPublicUrl(publicUrl: string | null): string | null {
    if (!publicUrl) {
      return null;
    }

    const marker = '/storage/v1/object/public/exercise-media/';
    const start = publicUrl.indexOf(marker);

    if (start < 0) {
      return null;
    }

    const rawPath = publicUrl.slice(start + marker.length).split('?')[0];
    return rawPath ? decodeURIComponent(rawPath) : null;
  }

  private isAllowedMediaFile(file: File): boolean {
    if (this.allowedMimeTypes.has(file.type)) {
      return true;
    }

    const extension = this.getFileExtension(file.name);
    return extension ? this.allowedExtensions.has(extension) : false;
  }

  private detectMediaType(fileName: string, mimeType: string): MediaPreviewType {
    if (mimeType === 'video/mp4') {
      return 'video';
    }

    if (mimeType.startsWith('image/')) {
      return 'image';
    }

    const extension = this.getFileExtension(fileName);
    if (!extension) {
      return null;
    }

    return extension === 'mp4' ? 'video' : 'image';
  }

  private isVideoAsset(path: string): boolean {
    const cleanedPath = path.split('?')[0].split('#')[0].toLowerCase();
    return cleanedPath.endsWith('.mp4');
  }

  private getFileExtension(fileName: string): string | null {
    const extension = fileName.split('.').pop()?.toLowerCase() ?? null;
    return extension && this.allowedExtensions.has(extension) ? extension : null;
  }

  private hasDuplicateDay(dayOfWeek: number, excludeSplitId?: string): boolean {
    return this.splits.some(
      (split) => split.dayOfWeek === dayOfWeek && split.id !== excludeSplitId
    );
  }

  private resetNewExerciseForm(): void {
    this.newExerciseName = '';
    this.newExerciseBodyPart = '';
    this.newExerciseSortOrder = 0;
    this.newExerciseInstructions = '';
    this.newExerciseSplitId = null;
    this.removeNewExerciseSelectedMedia();
  }

  private releasePreviewUrl(previewUrl: string | null): void {
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
  }

  private buildDayOptions(): DayOption[] {
    const labels = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    return labels.map((label, value) => ({ value, label }));
  }

  private async runWithLoading<T>(
    message: string,
    work: () => Promise<T>
  ): Promise<T> {
    this.isLoading = true;
    const loading = await this.loadingCtrl.create({
      message,
      spinner: 'crescent',
      mode: 'ios',
    });

    await loading.present();

    try {
      return await work();
    } finally {
      this.isLoading = false;
      await loading.dismiss();
    }
  }

  private async showError(error: unknown): Promise<void> {
    const message =
      error instanceof Error ? error.message : 'Something went wrong. Please try again.';

    await this.showToast(message, 'danger');
  }

  private async showToast(
    message: string,
    color: 'success' | 'danger' | 'warning' | 'primary'
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2600,
      color,
      position: 'bottom',
      mode: 'ios',
    });

    await toast.present();
  }
}
