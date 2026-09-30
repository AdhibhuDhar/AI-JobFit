import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JobService, Job } from '../job';

@Component({
  selector: 'app-job-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './job-list.html',
  styleUrl: './job-list.css'
})
export class JobList implements OnInit {
  jobs: Job[] = [];
  analyzingId: string | null = null;

  constructor(
    private jobService: JobService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadJobs();
  }

  loadJobs(): void {
    this.jobService.getJobs().subscribe({
      next: (data) => {
        this.jobs = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to load jobs:', err)
    });
  }

  remove(id: string | undefined): void {
    if (!id) return;
    this.jobService.deleteJob(id).subscribe(() => this.loadJobs());
  }

  analyze(id: string | undefined): void {
    if (!id) return;
    this.analyzingId = id;
    this.jobService.analyzeJob(id).subscribe({
      next: () => {
        this.analyzingId = null;
        this.loadJobs();
      },
      error: (err) => {
        this.analyzingId = null;
        console.error('Analysis failed:', err);
      }
    });
  }

  updateStatus(id: string | undefined, event: Event): void {
    if (!id) return;
    const status = (event.target as HTMLSelectElement).value;
    this.jobService.updateStatus(id, status).subscribe(() => this.loadJobs());
  }
}
