import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JobService } from '../job';

@Component({
  selector: 'app-profile-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-upload.html',
  styleUrl: './profile-upload.css'
})
export class ProfileUpload implements OnInit {
  selectedFile: File | null = null;
  uploading = false;
  currentSkills: string[] = [];

  @Output() profileUpdated = new EventEmitter<void>();

  constructor(private jobService: JobService) {}

  ngOnInit(): void {
    this.jobService.getProfile().subscribe(p => this.currentSkills = p.skills || []);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;
  }

  upload(): void {
    if (!this.selectedFile) return;
    this.uploading = true;
    this.jobService.uploadResume(this.selectedFile).subscribe({
      next: (profile) => {
        this.currentSkills = profile.skills || [];
        this.uploading = false;
        this.profileUpdated.emit();
      },
      error: (err) => {
        console.error('Resume upload failed:', err);
        this.uploading = false;
      }
    });
  }
}