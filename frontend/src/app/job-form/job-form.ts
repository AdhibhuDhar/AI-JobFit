import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JobService, Job } from '../job';

@Component({
  selector: 'app-job-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './job-form.html',
  styleUrl: './job-form.css'
})
export class JobForm {
  job: Job = { company: '', role: '', ctc: '', description: '' };

  @Output() jobAdded = new EventEmitter<void>();

  constructor(private jobService: JobService) {}

  submit(): void {
    this.jobService.addJob(this.job).subscribe(() => {
      this.job = { company: '', role: '', ctc: '', description: '' };
      this.jobAdded.emit();
    });
  }
}
