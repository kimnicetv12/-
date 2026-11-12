import type { JobState } from '../api';

const jobs = new Map<string, JobState & { projectId?: string }>();

export function startJob(kind: string, projectId: string | undefined, run: (step: (msg: string, progress?: number) => void) => Promise<unknown>) {
  const job: JobState & { projectId?: string } = { id: Math.random().toString(36).slice(2, 10), kind, projectId, status: 'running', progress: 0, message: '시작하는 중', log: [] };
  jobs.set(job.id, job);
  const step = (msg: string, progress?: number) => {
    job.message = msg;
    if (progress !== undefined) job.progress = Math.max(0, Math.min(1, progress));
    if (job.log[job.log.length - 1]?.slice(10) !== msg) job.log.push(`${new Date().toLocaleTimeString('ko-KR', { hour12: false })}  ${msg}`);
    if (job.log.length > 200) job.log.shift();
  };
  run(step)
    .then((r) => { job.result = r; job.status = 'done'; job.progress = 1; })
    .catch((e: unknown) => {
      job.status = 'error';
      job.error = e instanceof Error ? e.message : String(e);
      console.error(`[${kind}]`, e);
    });
  return { job: job.id };
}

export const getJob = (id: string) => { const j = jobs.get(id); return j ? { ...j, log: [...j.log] } : undefined; };
export const runningJobs = (projectId: string) => [...jobs.values()].filter((j) => j.projectId === projectId && j.status === 'running');
