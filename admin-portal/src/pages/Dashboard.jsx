import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, Users } from 'lucide-react';

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [workers, setWorkers] = useState([]);

  useEffect(() => {
    // Fetch initial data
    const fetchInitialData = async () => {
      const { data: initialTasks } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
      if (initialTasks) setTasks(initialTasks);

      const { data: initialWorkers } = await supabase.from('workers').select('*').order('name');
      if (initialWorkers) setWorkers(initialWorkers);
    };

    fetchInitialData();

    // Setup realtime subscriptions
    const tasksSubscription = supabase
      .channel('public:tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        setTasks((current) => {
          if (payload.eventType === 'INSERT') return [payload.new, ...current];
          if (payload.eventType === 'UPDATE') return current.map(t => t.id === payload.new.id ? payload.new : t);
          if (payload.eventType === 'DELETE') return current.filter(t => t.id !== payload.old.id);
          return current;
        });
      })
      .subscribe();

    const workersSubscription = supabase
      .channel('public:workers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workers' }, (payload) => {
        setWorkers((current) => {
          if (payload.eventType === 'INSERT') return [...current, payload.new];
          if (payload.eventType === 'UPDATE') return current.map(w => w.id === payload.new.id ? payload.new : w);
          if (payload.eventType === 'DELETE') return current.filter(w => w.id !== payload.old.id);
          return current;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tasksSubscription);
      supabase.removeChannel(workersSubscription);
    };
  }, []);

  return (
    <div className="dashboard-container">
      <header className="header">
        <h1>Smartry Admin Portal</h1>
        <button onClick={() => supabase.auth.signOut()} className="logout-btn">Sign Out</button>
      </header>
      
      <main className="main-content">
        <section className="panel">
          <div className="panel-header">
            <Activity size={24} style={{ color: '#3b82f6' }} />
            <h2 style={{ margin: 0 }}>Live Requests</h2>
          </div>
          <div className="task-list">
            {tasks.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No active requests.</p>
            ) : null}
            {tasks.map(task => (
              <div key={task.id} className="task-item">
                <div className="task-info">
                  <h3>{task.customer_name}</h3>
                  <p>{task.description}</p>
                </div>
                <div className={`badge ${task.status}`}>
                  {task.status}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <Users size={24} style={{ color: '#10b981' }} />
            <h2 style={{ margin: 0 }}>Active Workers</h2>
          </div>
          <div className="worker-list">
            {workers.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No workers found.</p>
            ) : null}
            {workers.map(worker => (
              <div key={worker.id} className="worker-item">
                <div className="worker-avatar">
                  {worker.name.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', margin: 0 }}>{worker.name}</strong>
                </div>
                <div className={`worker-status ${worker.status}`} title={worker.status} />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
