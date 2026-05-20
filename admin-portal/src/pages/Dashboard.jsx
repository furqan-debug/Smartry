import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, Users } from 'lucide-react';

const SlaTimer = ({ deadline, status }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isBreached, setIsBreached] = useState(false);

  useEffect(() => {
    if (!deadline || status === 'completed') return;
    const updateTimer = () => {
      const diff = new Date(deadline) - new Date();
      if (diff <= 0) {
        setIsBreached(true);
        setTimeLeft('Breached');
      } else {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${m}m ${s}s`);
        setIsBreached(false);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [deadline, status]);

  if (!deadline || status === 'completed') return null;

  return (
    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: isBreached ? '#ef4444' : '#10b981', marginTop: '6px', background: isBreached ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px', display: 'inline-block' }}>
      ⏳ {timeLeft}
    </div>
  );
};

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');

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

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (search && !(`${t.description} ${t.customer_name} ${t.location}`.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const pendingCount = tasks.filter(task => task.status === 'pending').length;
  const acceptedCount = tasks.filter(task => task.status === 'accepted').length;
  const completedCount = tasks.filter(task => task.status === 'completed').length;

  const assignTask = async (taskId, workerId) => {
    if (!workerId) return;
    try {
      await supabase.from('tasks').update({ worker_id: workerId, status: 'accepted' }).eq('id', taskId);
    } catch (e) {
      console.error('Assign error', e);
    }
  };

  const markCompleted = async (taskId) => {
    try {
      await supabase.from('tasks').update({ status: 'completed' }).eq('id', taskId);
    } catch (e) {
      console.error('Complete error', e);
    }
  };

  return (
    <div className="dashboard-container">
      <header className="header">
        <h1>Smartry Admin Portal</h1>
        <button onClick={() => supabase.auth.signOut()} className="logout-btn">Sign Out</button>
      </header>
      
      <main className="main-content">
        <section className="panel">
          <div className="panel-summary">
            <div className="summary-card">
              <span>Pending</span>
              <strong>{pendingCount}</strong>
            </div>
            <div className="summary-card">
              <span>Accepted</span>
              <strong>{acceptedCount}</strong>
            </div>
            <div className="summary-card">
              <span>Completed</span>
              <strong>{completedCount}</strong>
            </div>
          </div>
          <div className="panel-toolbar">
            <input placeholder="Search requests" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="completed">Completed</option>
            </select>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="all">All priorities</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="panel-header">
            <Activity size={24} style={{ color: '#3b82f6' }} />
            <h2 style={{ margin: 0 }}>Live Requests</h2>
          </div>
          <div className="task-list">
            {tasks.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No active requests.</p>
            ) : null}
            {filteredTasks.length === 0 && tasks.length > 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No requests match the current filters.</p>
            ) : null}
            {filteredTasks.map(task => (
              <div key={task.id} className="task-item">
                <div className="task-info">
                  <h3>{task.customer_name} <span style={{color: '#94a3b8', fontSize: '0.9rem', fontWeight: 'normal'}}>• {task.location || 'No Location'}</span></h3>
                  <p style={{marginBottom: '4px'}}>{task.description}</p>
                  <p style={{fontSize: '0.8rem', color: '#60a5fa', margin: 0}}>{task.category} • Priority: {task.priority}</p>
                  <SlaTimer deadline={task.sla_deadline} status={task.status} />
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', minWidth: 220}}>
                  <div className={`badge ${task.status}`}>
                    {task.status}
                  </div>
                  <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                    <select value={task.worker_id || ''} onChange={(e) => assignTask(task.id, e.target.value)}>
                      <option value="">Assign to...</option>
                      {workers.map(w => (
                        <option key={w.id} value={w.id}>{w.name} ({w.role || 'Staff'})</option>
                      ))}
                    </select>
                    {task.status !== 'completed' && (
                      <button onClick={() => markCompleted(task.id)}>Complete</button>
                    )}
                  </div>
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
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{worker.role || 'Staff'}</span>
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
