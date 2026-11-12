import type { JobState } from '../api';

export function JobView({ job }: { job: JobState | null }) {
  if (!job) return null;
  if (job.status === 'error') return <p className="msg err" role="alert">{job.error}</p>;
  if (job.status === 'done') return null;
  const pct = Math.round((job.progress || 0) * 100);
  return (
    <div className="job" role="status" aria-live="polite">
      <div className="job-top"><span>{job.message}</span><span className="num">{pct}%</span></div>
      <div className="job-bar"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
