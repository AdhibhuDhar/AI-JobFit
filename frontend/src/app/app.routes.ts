import { Routes } from '@angular/router';
import { ProfileView } from './profile-view/profile-view';
import { DiscoverView } from './discover-view/discover-view';
import { JobsView } from './jobs-view/jobs-view';

// Profile is the landing route: every score on the site is derived from it, so
// it is the first thing a new user needs to do.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'profile' },
  { path: 'profile', title: 'Profile · AI JobFit', component: ProfileView },
  { path: 'discover', title: 'Find openings · AI JobFit', component: DiscoverView },
  { path: 'jobs', title: 'Your jobs · AI JobFit', component: JobsView },
  // Anything else lands on the profile rather than a blank screen.
  { path: '**', redirectTo: 'profile' },
];
