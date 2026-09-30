import { Component, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { JobService, Health } from './job';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  /** null = still checking; false = backend unreachable. */
  health = signal<Health | null>(null);

  constructor(private jobs: JobService) {}

  ngOnInit(): void {
    this.jobs.getHealth().subscribe({
      next: (h) => this.health.set(h),
      // Health is advisory. Every view surfaces its own errors, so a failed
      // probe here must not blank the page — just drop the indicator.
      error: () => this.health.set(null),
    });
  }

  badge(): string | null {
    const h = this.health();
    if (!h) return null;
    if (!h.geminiKey) return 'No Gemini key';
    if (!h.mongo) return 'Mongo disconnected';
    return null;
  }
}
