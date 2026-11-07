import type { Metadata } from 'next';
import { requireSession } from '@/lib/server/session';
import { isOverdue, listDoneTasks, listPendingTasks } from '@/features/tasks/queries';
import { TaskForm } from '@/components/task-form';
import { TaskItem } from '@/components/task-item';

export const metadata: Metadata = { title: 'Tareas' };

export default async function TasksPage() {
  const { db, today, nowTime } = await requireSession();
  const [pending, done] = await Promise.all([listPendingTasks(db), listDoneTasks(db, 20)]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tareas</h1>
      <TaskForm />
      <section className="space-y-2">
        <h2 className="label">Pendientes · {pending.length}</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">Nada pendiente. ¡Bien hecho!</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((t) => (
              <TaskItem key={t.id} task={t} overdue={isOverdue(t, today, nowTime)} />
            ))}
          </ul>
        )}
      </section>
      {done.items.length > 0 && (
        <section className="space-y-2">
          <h2 className="label">Completadas recientemente</h2>
          <ul className="space-y-2">
            {done.items.map((t) => (
              <TaskItem key={t.id} task={t} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
