import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { KeyValuePipe } from '@angular/common';
import { Router } from '@angular/router';
import { JobService, DiscoverResult, Job, extractError } from '../job';

type Tab = 'discover' | 'paste';

@Component({
  selector: 'app-discover-view',
  standalone: true,
  imports: [FormsModule, KeyValuePipe],
  templateUrl: './discover-view.html',
  styleUrl: './discover-view.css',
})
export class DiscoverView {
  tab = signal<Tab>('discover');

  limit = 15;
  busy = signal(false);
  error = signal('');
  result = signal<DiscoverResult | null>(null);

  // Paste-a-job
  company = '';
  role = '';
  location = '';
  url = '';
  description = '';
  pasteMode = signal<'url' | 'text'>('url');
  pasteBusy = signal(false);
  pasteError = signal('');
  pasteNotice = signal('');

  constructor(private jobs: JobService, private router: Router) {}

  ngOnInit(): void {
    // Always start with a usable job list behind the discover results.
    this.load();
  }

  load(): void {
    this.jobs.getJobs().subscribe({
      error: (e) => this.error.set(extractError(e)),
    });
  }

  findOpenings(): void {
    this.busy.set(true);
    this.error.set('');
    this.result.set(null);
    this.jobs.discoverJobs(Number(this.limit) || 15).subscribe({
      next: (r) => {
        this.result.set(r);
        this.busy.set(false);
      },
      error: (e) => {
        this.error.set(extractError(e));
        this.busy.set(false);
      },
    });
  }

  sourceName(s: string): string {
    return s === 'arbeitnow' ? 'Arbeitnow' : s === 'remotive' ? 'Remotive' : s;
  }

  addFromUrl(): void {
    if (!this.url.trim()) {
      this.pasteError.set('Paste a link to the job posting.');
      return;
    }
    this.pasteBusy.set(true);
    this.pasteError.set('');
    this.pasteNotice.set('');
    this.jobs.addJobFromUrl(this.url.trim()).subscribe({
      next: (r) => {
        this.pasteBusy.set(false);
        this.url = '';
        this.afterCreate(r.job, r.analyzeError);
      },
      error: (e) => {
        this.pasteError.set(extractError(e));
        this.pasteBusy.set(false);
      },
    });
  }

  addFromText(): void {
    if (this.description.trim().length < 40) {
      this.pasteError.set('Paste the full job description — at least a few sentences.');
      return;
    }
    this.pasteBusy.set(true);
    this.pasteError.set('');
    this.pasteNotice.set('');
    this.jobs
      .addJobFromText({
        company: this.company.trim(),
        role: this.role.trim(),
        location: this.location.trim(),
        description: this.description.trim(),
      })
      .subscribe({
        next: (r) => {
          this.pasteBusy.set(false);
          this.description = '';
          this.afterCreate(r.job, r.analyzeError);
        },
        error: (e) => {
          this.pasteError.set(extractError(e));
          this.pasteBusy.set(false);
        },
      });
  }

  private afterCreate(job: Job, analyzeError: { error: string } | null): void {
    if (analyzeError) {
      // The job is tracked either way; the score is what failed.
      this.pasteNotice.set(`Job added, but scoring failed: ${analyzeError.error}`);
      this.tab.set('discover');
      this.load();
      return;
    }
    this.pasteNotice.set('Job added and scored.');
    this.tab.set('discover');
    this.load();
  }

  goToJobs(): void {
    this.router.navigate(['/jobs']);
  }
}
