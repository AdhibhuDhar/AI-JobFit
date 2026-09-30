import { Component, OnInit, signal } from '@angular/core';
import { JobService, Profile, extractError } from '../job';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-profile-view',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './profile-view.html',
  styleUrl: './profile-view.css',
})
export class ProfileView {
  profile = signal<Profile | null>(null);
  loading = signal(true);
  uploading = signal(false);
  refreshing = signal(false);
  error = signal('');
  notice = signal('');

  constructor(private jobs: JobService) {}

  ngOnInit(): void {
    this.jobs.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(extractError(e));
        this.loading.set(false);
      },
    });
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Checked client-side so the user is not made to wait for an upload that
    // the server is going to reject anyway.
    const okExt = /\.(pdf|docx)$/i.test(file.name);
    if (!okExt) {
      this.error.set('Only .pdf and .docx resumes are supported.');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.error.set('That file is larger than 5 MB.');
      input.value = '';
      return;
    }

    this.uploading.set(true);
    this.error.set('');
    this.notice.set('');

    this.jobs.uploadResume(file).subscribe({
      next: (p) => {
        this.profile.set({ ...p, source: 'resume' });
        this.uploading.set(false);
        this.notice.set('Resume parsed. Job scores below were computed against your old one — refresh them to update.');
        input.value = '';
      },
      error: (e) => {
        this.error.set(extractError(e));
        this.uploading.set(false);
        input.value = '';
      },
    });
  }

  /** Re-score every job against the resume that is now in the database. */
  refreshScores(): void {
    this.refreshing.set(true);
    this.error.set('');
    this.jobs.analyzeBatch(true).subscribe({
      next: (r) => {
        this.refreshing.set(false);
        this.notice.set(
          r.attempted === 0
            ? 'Every job is already scored against this resume.'
            : `Re-scored ${r.succeeded} of ${r.attempted} job(s).${r.failed ? ` ${r.failed} failed — try again.` : ''}`
        );
      },
      error: (e) => {
        this.error.set(extractError(e));
        this.refreshing.set(false);
      },
    });
  }
}
