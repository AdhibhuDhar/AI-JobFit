import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JobService, Job, Profile, extractError } from '../job';

type ScoreBand = 'high' | 'mid' | 'low' | 'none';

@Component({
  selector: 'app-jobs-view',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './jobs-view.html',
  styleUrl: './jobs-view.css',
})
export class JobsView {
  jobs = signal<Job[]>([]);
  profile = signal<Profile | null>(null);
  loading = signal(true);
  error = signal('');

  /** id -> true while that one job is being scored. */
  analyzing = signal<Set<string>>(new Set());
  expanded = signal<Set<string>>(new Set());

  constructor(private jobs_: JobService) {}

  ngOnInit(): void {
    this.load();
    this.jobs_.getProfile().subscribe({
      next: (p) => this.profile.set(p),
      error: () => this.profile.set(null), // non-fatal: the list still works
    });
  }

  load(): void {
    this.loading.set(true);
    this.jobs_.getJobs().subscribe({
      next: (j) => {
        this.jobs.set(j);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(extractError(e));
        this.loading.set(false);
      },
    });
  }

  private mark(set: Set<string>, id: string, on: boolean): Set<string> {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  }

  isAnalyzing(id: string): boolean {
    return this.analyzing().has(id);
  }

  isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  toggle(id: string): void {
    this.expanded.set(this.mark(this.expanded(), id, !this.isExpanded(id)));
  }

  analyze(job: Job): void {
    const id = job._id!;
    this.analyzing.set(this.mark(this.analyzing(), id, true));
    this.error.set('');
    this.jobs_.analyzeJob(id).subscribe({
      next: (updated) => {
        this.analyzing.set(this.mark(this.analyzing(), id, false));
        this.jobs.update((list) => list.map((j) => (j._id === id ? updated : j)));
        this.expanded.set(this.mark(this.expanded(), id, true));
      },
      error: (e) => {
        this.analyzing.set(this.mark(this.analyzing(), id, false));
        this.error.set(extractError(e));
      },
    });
  }

  remove(job: Job): void {
    const id = job._id!;
    this.jobs_.deleteJob(id).subscribe({
      next: () => this.jobs.update((list) => list.filter((j) => j._id !== id)),
      error: (e) => this.error.set(extractError(e)),
    });
  }

  setStatus(job: Job, status: string): void {
    const id = job._id!;
    this.jobs_.updateStatus(id, status).subscribe({
      next: (updated) => this.jobs.update((list) => list.map((j) => (j._id === id ? updated : j))),
      error: (e) => this.error.set(extractError(e)),
    });
  }

  band(job: Job): ScoreBand {
    const s = job.analysis?.matchScore;
    if (s === undefined || s === null) return 'none';
    if (s >= 75) return 'high';
    if (s >= 50) return 'mid';
    return 'low';
  }

  /** Optional because `Job.source` is server-assigned — see the interface. */
  sourceLabel(s?: string): string {
    if (s === 'arbeitnow') return 'Arbeitnow';
    if (s === 'remotive') return 'Remotive';
    if (s === 'url') return 'From link';
    if (s === 'pasted') return 'Pasted';
    return 'Manual';
  }

  /** True when the score on screen predates the resume now in the database. */
  isStale(job: Job): boolean {
    const p = this.profile();
    if (!p || p.source !== 'resume') return false;
    if (!job.analysis?.matchScore) return false;
    if (!job.analyzedProfileUpdatedAt || !p.updatedAt) return false;
    return new Date(job.analyzedProfileUpdatedAt).getTime() !== new Date(p.updatedAt).getTime();
  }

  statusOptions = ['saved', 'applied', 'interview', 'offer', 'rejected'];
}
