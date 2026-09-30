import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../environments/environment';

/**
 * Resolve the backend origin once, at module load.
 *
 * Read from `window` first so a deployment can override the compiled-in default
 * without a rebuild, then localStorage for per-developer retargeting. Every
 * step is guarded: this runs during SSR-free bootstrap but the guards also keep
 * it safe if the bundle is ever evaluated outside a browser.
 */
function resolveApiBase(): string {
  const injected = (globalThis as { __API_BASE__?: string }).__API_BASE__;
  if (typeof injected === 'string' && injected) return injected;

  try {
    const stored = globalThis.localStorage?.getItem('apiBase');
    if (stored) return stored;
  } catch {
    // Storage can throw in private-browsing modes; the default still works.
  }

  return environment.apiBase;
}

const API = resolveApiBase().replace(/\/$/, '');

export interface Problem {
  title: string;
  difficulty: string;
  url: string;
}

export interface PrepTask {
  text: string;
  topic: string;
  resourceLabel: string;
  resourceUrl: string;
  problems: Problem[];
}

export interface Analysis {
  matchScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: {
    priority: string;
    topic: string;
    why: string;
    resourceLabel: string;
    resourceUrl: string;
  }[];
  preparationPlan: { day: number; tasks: PrepTask[] }[];
}

export interface Job {
  _id?: string;
  /**
   * Server-assigned ('manual' | 'url' | 'pasted' | 'arbeitnow' | 'remotive'), so
   * it is absent on the objects a client builds to create one.
   */
  source?: string;
  company: string;
  role: string;
  ctc?: string;
  description: string;
  url?: string;
  location?: string;
  tags?: string[];
  status?: string;
  createdAt?: string;
  analysis?: Analysis;
  analyzedAt?: string;
  analyzedProfileUpdatedAt?: string;
}

export interface Profile {
  _id?: string;
  skills: string[];
  experience: string;
  projects: string[];
  education: string[];
  totalExperienceYears?: number;
  resumeFileName?: string;
  updatedAt?: string;
  /** 'resume' when uploaded, 'fallback' when we are using the hardcoded stub. */
  source: 'resume' | 'fallback';
}

export interface Health {
  ok: boolean;
  mongo: number;
  geminiKey: boolean;
}

export interface SourceStatus {
  ok: boolean;
  fetched: number;
  kept: number;
  error?: string;
}

export interface DiscoverResult {
  created: number;
  skipped: number;
  needsProfile: boolean;
  scoredSucceeded: number;
  scoredFailed: number;
  scoringCapped: boolean;
  jobs: Job[];
  sources: Record<string, SourceStatus>;
  stats: { fetched: number; unique: number; relevant: number; tookMs: number };
}

export interface BatchResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

/** Turn a failed HttpClient call into something a template can actually show. */
export function extractError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    // The backend always answers with { error, code } — even from the global
    // error handler — so this is almost always populated.
    const body = err.error as { error?: string } | null;
    if (body && typeof body.error === 'string' && body.error) return body.error;
    // Names the origin actually in use, which may not be the default port.
    if (err.status === 0) return `Could not reach the backend at ${API}. Is it running?`;
    return `Request failed (HTTP ${err.status}).`;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

@Injectable({ providedIn: 'root' })
export class JobService {
  private jobsUrl = `${API}/jobs`;
  private profileUrl = `${API}/profile`;

  constructor(private http: HttpClient) {}

  getHealth(): Observable<Health> {
    return this.http.get<Health>(`${API}/health`);
  }

  getJobs(): Observable<Job[]> {
    return this.http.get<Job[]>(this.jobsUrl);
  }

  addJob(job: Partial<Job>): Observable<Job> {
    return this.http.post<Job>(this.jobsUrl, job);
  }

  /** Find real openings on public job boards. Bounded so it cannot run away. */
  discoverJobs(limit = 20): Observable<DiscoverResult> {
    return this.http
      .post<DiscoverResult>(`${this.jobsUrl}/discover`, { limit: Math.min(50, Math.max(1, limit)) })
      .pipe(catchError((e) => throwError(() => extractError(e))));
  }

  addJobFromUrl(url: string): Observable<{ job: Job; analyzeError: { error: string } | null }> {
    return this.http
      .post<{ job: Job; analyzeError: { error: string } | null }>(`${this.jobsUrl}/from-url`, { url })
      .pipe(catchError((e) => throwError(() => extractError(e))));
  }

  addJobFromText(payload: {
    company: string;
    role: string;
    description: string;
    location?: string;
  }): Observable<{ job: Job; analyzeError: { error: string } | null }> {
    return this.http
      .post<{ job: Job; analyzeError: { error: string } | null }>(`${this.jobsUrl}/from-text`, payload)
      .pipe(catchError((e) => throwError(() => extractError(e))));
  }

  /** Re-score jobs that were never analyzed, or analyzed against an older resume. */
  analyzeBatch(onlyStale = true): Observable<BatchResult> {
    return this.http
      .post<BatchResult>(`${this.jobsUrl}/analyze-batch`, { onlyStale })
      .pipe(catchError((e) => throwError(() => extractError(e))));
  }

  deleteJob(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.jobsUrl}/${id}`);
  }

  analyzeJob(id: string): Observable<Job> {
    return this.http
      .post<Job>(`${this.jobsUrl}/${id}/analyze`, {})
      .pipe(catchError((e) => throwError(() => extractError(e))));
  }

  updateStatus(id: string, status: string): Observable<Job> {
    return this.http.put<Job>(`${this.jobsUrl}/${id}`, { status });
  }

  uploadResume(file: File): Observable<Profile> {
    const formData = new FormData();
    formData.append('resume', file);
    return this.http
      .post<Profile>(`${this.profileUrl}/upload-resume`, formData)
      .pipe(catchError((e) => throwError(() => extractError(e))));
  }

  getProfile(): Observable<Profile> {
    return this.http
      .get<Profile>(this.profileUrl)
      .pipe(catchError((e) => throwError(() => extractError(e))));
  }
}
