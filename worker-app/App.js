import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView, Alert } from 'react-native';
import { supabase } from './src/lib/supabase';

const isSupabaseMissing = !process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const SlaTimer = ({ deadline }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isBreached, setIsBreached] = useState(false);

  useEffect(() => {
    if (!deadline) return;
    const updateTimer = () => {
      const diff = new Date(deadline) - new Date();
      if (diff <= 0) {
        setIsBreached(true);
        setTimeLeft('SLA Breached');
      } else {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${m}m ${s}s left`);
        setIsBreached(false);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (!deadline) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: isBreached ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', alignSelf: 'flex-start', borderRadius: 8 }}>
      <Text style={{ color: isBreached ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>
        ⏳ {timeLeft}
      </Text>
    </View>
  );
};

export default function App() {
  const [worker, setWorker] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [roleInput, setRoleInput] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  const pendingTasks = tasks.filter(task => task.status === 'pending').length;
  const acceptedTasks = tasks.filter(task => task.status === 'accepted' && task.worker_id === worker?.id).length;

  // Auth handler
  const handleAuth = async () => {
    if (loading) return;
    if (!emailInput.trim() || !passwordInput.trim()) return;
    setLoading(true);
    try {
        if (isSignUp) {
          if (!nameInput.trim()) throw new Error("Name is required");
          if (!roleInput.trim()) throw new Error("Role is required");
          const { data, error } = await supabase.auth.signUp({ email: emailInput.trim(), password: passwordInput.trim() });
          if (error) throw error;
          const { data: created } = await supabase.from('workers').insert([{ name: nameInput.trim(), email: emailInput.trim(), role: roleInput.trim(), status: 'online' }]).select().single();
          setWorker(created);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: emailInput.trim(), password: passwordInput.trim() });
        if (error) throw error;
        const { data: existing } = await supabase.from('workers').select('*').eq('email', emailInput.trim()).single();
        if (existing) {
          await supabase.from('workers').update({ status: 'online' }).eq('id', existing.id);
          setWorker(existing);
        } else {
           throw new Error("Worker record not found.");
        }
      }
    } catch (e) {
      Alert.alert("Auth Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    if (worker) await supabase.from('workers').update({ status: 'offline' }).eq('id', worker.id);
    await supabase.auth.signOut();
    setWorker(null);
    setTasks([]);
  };

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        const { data: existing } = await supabase.from('workers').select('*').eq('email', session.user.email).single();
        if (existing) {
           await supabase.from('workers').update({ status: 'online' }).eq('id', existing.id);
           setWorker(existing);
        }
      }
    };
    checkSession();
  }, []);

  // Dashboard logic
  useEffect(() => {
    if (!worker) return;

    // Fetch initial tasks (pending, or accepted by me)
    const fetchTasks = async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .or(`status.eq.pending,and(status.eq.accepted,worker_id.eq.${worker.id})`)
        .order('created_at', { ascending: false });
      if (data) setTasks(data);
    };

    fetchTasks();

    // Subscribe to task updates
    const channel = supabase
      .channel('public:tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
        setTasks(current => {
          if (payload.eventType === 'INSERT') {
            return [payload.new, ...current];
          }
          if (payload.eventType === 'UPDATE') {
            const up = payload.new;
            // if task is completed or accepted by someone else, remove it
            if (up.status === 'completed' || (up.status === 'accepted' && up.worker_id !== worker.id)) {
              return current.filter(t => t.id !== up.id);
            }
            
            // if it exists, update it
            if (current.find(t => t.id === up.id)) {
              return current.map(t => t.id === up.id ? up : t);
            }
            // if it is new to us (e.g., someone rejected it and it's pending again)
            if (up.status === 'pending') {
              return [up, ...current].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
            }
            return current;
          }
          if (payload.eventType === 'DELETE') {
            return current.filter(t => t.id !== payload.old.id);
          }
          return current;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [worker]);

  // Task Handlers
  const acceptTask = async (taskId) => {
    await supabase.from('tasks').update({ status: 'accepted', worker_id: worker.id }).eq('id', taskId);
    await supabase.from('workers').update({ status: 'busy' }).eq('id', worker.id);
  };

  const completeTask = async (taskId) => {
    await supabase.from('tasks').update({ status: 'completed' }).eq('id', taskId);
    // Automatically set worker back to online if no other accepted tasks
    const { count } = await supabase.from('tasks').select('*', { count: 'exact' }).eq('worker_id', worker.id).eq('status', 'accepted');
    if (count === 0) {
      await supabase.from('workers').update({ status: 'online' }).eq('id', worker.id);
    }
  };

  const rejectTask = async (taskId) => {
    await supabase.from('tasks').update({ status: 'pending', worker_id: null }).eq('id', taskId);
  };

  if (!worker) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loginCenter}>
          <Text style={styles.title}>Smartry Staff</Text>
          <Text style={styles.subtitle}>{isSignUp ? 'Create your staff account' : 'Sign in to your account'}</Text>
          {isSupabaseMissing && (
            <View style={styles.configWarning}>
              <Text style={styles.configWarningTitle}>Configuration required</Text>
              <Text style={styles.configWarningText}>Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in worker-app/.env or Expo environment variables.</Text>
            </View>
          )}
          {isSignUp && (
            <>
              <TextInput style={styles.input} value={nameInput} onChangeText={setNameInput} placeholder="Your Name" placeholderTextColor="#64748b" />
              <TextInput style={styles.input} value={roleInput} onChangeText={setRoleInput} placeholder="Role (e.g. Housekeeping)" placeholderTextColor="#64748b" />
            </>
          )}

          <TextInput style={styles.input} value={emailInput} onChangeText={setEmailInput} placeholder="Email Address" placeholderTextColor="#64748b" autoCapitalize="none" keyboardType="email-address" />
          <TextInput style={styles.input} value={passwordInput} onChangeText={setPasswordInput} placeholder="Password" placeholderTextColor="#64748b" secureTextEntry />

          <TouchableOpacity style={styles.button} onPress={handleAuth} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Sign In')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={{marginTop: 20}} onPress={() => setIsSignUp(!isSignUp)}>
            <Text style={{color: '#3b82f6', textAlign: 'center'}}>{isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Tasks</Text>
          <Text style={styles.headerSubtitle}>Logged in as {worker.name}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Pending</Text>
          <Text style={styles.metricValue}>{pendingTasks}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Accepted</Text>
          <Text style={styles.metricValue}>{acceptedTasks}</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {tasks.length === 0 ? (
          <Text style={styles.emptyText}>No available tasks right now.</Text>
        ) : null}

        {tasks.map(task => (
          <View key={task.id} style={[styles.card, task.status === 'accepted' ? styles.cardAccepted : {}]}>
            <View style={styles.cardHeader}>
              <View style={{flex: 1, paddingRight: 10}}>
                <Text style={styles.customerName}>{task.customer_name} • {task.location || 'No Location'}</Text>
                <Text style={{color: '#94a3b8', fontSize: 13, marginTop: 4}}>{task.category} • Priority: {task.priority}</Text>
              </View>
              <Text style={[styles.badge, styles[`badge_${task.status}`]]}>{task.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.taskDesc}>{task.description}</Text>
            {task.status !== 'completed' && <SlaTimer deadline={task.sla_deadline} />}
            
            <View style={styles.actions}>
              {task.status === 'pending' && (
                <TouchableOpacity style={[styles.actionBtn, styles.btnAccept]} onPress={() => acceptTask(task.id)}>
                  <Text style={styles.actionText}>Accept Task</Text>
                </TouchableOpacity>
              )}
              {task.status === 'accepted' && task.worker_id === worker.id && (
                <>
                  <TouchableOpacity style={[styles.actionBtn, styles.btnComplete]} onPress={() => completeTask(task.id)}>
                    <Text style={styles.actionText}>Mark Complete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.btnReject]} onPress={() => rejectTask(task.id)}>
                    <Text style={styles.actionText}>Return</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  loginCenter: { flex: 1, justifyContent: 'center', padding: 30 },
  title: { fontSize: 32, fontWeight: '800', color: '#f8fafc', marginBottom: 10, textAlign: 'center', letterSpacing: 1 },
  subtitle: { fontSize: 16, color: '#94a3b8', marginBottom: 40, textAlign: 'center' },
  input: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b', padding: 18, borderRadius: 12, fontSize: 16, marginBottom: 16, color: '#f8fafc' },
  button: { backgroundColor: '#2563eb', padding: 18, borderRadius: 12, alignItems: 'center', shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  header: { padding: 24, paddingTop: 60, backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#f8fafc' },
  headerSubtitle: { fontSize: 14, color: '#94a3b8', marginTop: 4 },
  logoutBtn: { padding: 10, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 },
  logoutText: { color: '#ef4444', fontWeight: 'bold' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  emptyText: { textAlign: 'center', color: '#64748b', marginTop: 50, fontSize: 16 },
  card: { backgroundColor: '#0f172a', padding: 24, borderRadius: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#334155', borderWidth: 1, borderColor: '#1e293b' },
  cardAccepted: { borderLeftColor: '#2563eb' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  customerName: { fontWeight: '700', fontSize: 18, color: '#f8fafc' },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, fontSize: 12, fontWeight: '800', overflow: 'hidden', letterSpacing: 0.5 },
  badge_pending: { backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#fcd34d' },
  badge_accepted: { backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#93c5fd' },
  taskDesc: { fontSize: 18, color: '#cbd5e1', marginBottom: 24, lineHeight: 26 },
  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnAccept: { backgroundColor: '#2563eb' },
  btnComplete: { backgroundColor: '#10b981' },
  btnReject: { backgroundColor: '#1e293b', flex: 0.5 },
  actionText: { fontWeight: '700', color: '#ffffff', fontSize: 16 },
  metricsRow: { flexDirection: 'row', gap: 12, marginHorizontal: 20, marginBottom: 16 },
  metricCard: { flex: 1, padding: 18, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: '#1e293b' },
  metricLabel: { color: '#94a3b8', marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  metricValue: { color: '#f8fafc', fontSize: 28, fontWeight: '800' },
  configWarning: { backgroundColor: 'rgba(248, 113, 113, 0.12)', borderColor: 'rgba(248, 113, 113, 0.25)', borderWidth: 1, padding: 14, borderRadius: 14, marginBottom: 20 },
  configWarningTitle: { color: '#fee2e2', fontWeight: '700', marginBottom: 6 },
  configWarningText: { color: '#f8d7da', fontSize: 13, lineHeight: 18 },
});
