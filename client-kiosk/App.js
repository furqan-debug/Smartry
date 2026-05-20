import { StatusBar } from 'expo-status-bar';
import { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { supabase } from './src/lib/supabase';

const isSupabaseMissing = !process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// OpenRouter Key from env
const OPENROUTER_KEY = process.env.EXPO_PUBLIC_OPENROUTER_KEY;

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am your Smartry Assistant. How can I help you today?' }
  ]);
  const [inputText, setInputText] = useState('');
  const [location, setLocation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef();

  useEffect(() => {
    const channel = supabase
      .channel('public:tasks')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, payload => {
        const { new: updatedTask, old: oldTask } = payload;
        if (updatedTask.customer_name === 'Kiosk Station 1') {
          if (oldTask.status === 'pending' && updatedTask.status === 'accepted') {
            setMessages(prev => [...prev, { role: 'assistant', content: `Good news! Your request "${updatedTask.description}" has been accepted by our staff and they are on it.` }]);
          } else if (oldTask.status === 'accepted' && updatedTask.status === 'completed') {
            setMessages(prev => [...prev, { role: 'assistant', content: `Update: Your request "${updatedTask.description}" has been completed.` }]);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage = { role: 'user', content: inputText.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    try {
      const systemPrompt = {
        role: 'system',
        content: `You are a concise AI assistant at a hospitality venue serving guests via a tablet kiosk. 
If the guest makes a request that staff should handle (e.g., "I need towels", "Bring a menu", "Maintenance issue"), you MUST include a JSON block in your response formatted EXACTLY like this: \`\`\`json\n{"task": "the detailed task for staff", "category": "Housekeeping|F&B|Maintenance|Front Desk", "priority": "low|normal|urgent"}\n\`\`\`
Along with the JSON, politely confirm to the user that you are sending the request structure. Keep answers short.`
      };

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://smartry.app',
          'X-Title': 'Smartry Kiosk',
        },
        body: JSON.stringify({
          model: 'openrouter/free',
          messages: [systemPrompt, ...newMessages],
        })
      });

      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        let assistantReply = data.choices[0].message.content;
        
        // Extract JSON task
        const jsonMatch = assistantReply.match(/```json\n([\s\S]*?)\n```/) || assistantReply.match(/```\n([\s\S]*?)\n```/) || assistantReply.match(/{[\s\S]*"task"[\s\S]*}/);
        
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            if (parsed.task) {
              const priority = parsed.priority || 'normal';
              let slaMinutes = 30;
              if (priority === 'urgent') slaMinutes = 15;
              if (priority === 'low') slaMinutes = 60;
              
              const sla_deadline = new Date();
              sla_deadline.setMinutes(sla_deadline.getMinutes() + slaMinutes);

              await supabase.from('tasks').insert([
                { 
                  description: parsed.task, 
                  customer_name: location,
                  location: location,
                  category: parsed.category || 'General',
                  priority: priority,
                  sla_deadline: sla_deadline.toISOString()
                }
              ]);
              assistantReply = assistantReply.replace(jsonMatch[0], '').trim();
              if (!assistantReply) assistantReply = "I have sent your request to our staff!";
            }
          } catch (e) {
            console.error("JSON Parse Error", e);
          }
        }

        setMessages([...newMessages, { role: 'assistant', content: assistantReply }]);
      }
    } catch (error) {
      console.error(error);
      setMessages([...newMessages, { role: 'assistant', content: 'Connection issue. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!location) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.headerText}>Smartry AI Front Desk</Text>
        </View>
        <View style={{flex:1, justifyContent:'center', alignItems:'center', padding:24}}>
          <Text style={{color:'#fafafa', fontSize:24, marginBottom:20, fontWeight:'600'}}>Where are you located?</Text>
          <Text style={{color:'#94a3b8', fontSize:16, marginBottom:40, textAlign:'center'}}>Please enter your Room Number or Table Number so our staff can assist you.</Text>
          <TextInput
             style={[styles.input, {width: '100%', marginBottom: 20}]}
             placeholder="e.g., Room 204 or Table 12"
             placeholderTextColor="#9ca3af"
             value={inputText}
             onChangeText={setInputText}
             onSubmitEditing={() => { if(inputText.trim()) { setLocation(inputText.trim()); setInputText(''); } }}
          />
          <TouchableOpacity style={[styles.sendButton, {width: '100%', paddingVertical: 18, alignItems:'center'}]} onPress={() => { if(inputText.trim()) { setLocation(inputText.trim()); setInputText(''); } }}>
            <Text style={styles.sendButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerText}>Smartry AI Front Desk</Text>
      </View>
      {isSupabaseMissing && (
        <View style={styles.configWarning}>
          <Text style={styles.configWarningTitle}>Configuration required</Text>
          <Text style={styles.configWarningText}>Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in client-kiosk/.env or Expo environment variables.</Text>
        </View>
      )}
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          ref={scrollViewRef}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg, index) => (
            <View key={index} style={msg.role === 'user' ? styles.userMessage : styles.assistantMessage}>
              <Text style={msg.role === 'user' ? styles.userMessageText : styles.assistantMessageText}>
                {msg.content}
              </Text>
            </View>
          ))}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#3b82f6" />
            </View>
          )}
        </ScrollView>

        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type your request here... (e.g. I need fresh towels)"
            placeholderTextColor="#9ca3af"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={isLoading}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  header: { padding: 25, paddingTop: 60, backgroundColor: 'rgba(20, 20, 25, 0.8)', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  headerText: { color: '#fafafa', fontSize: 24, fontWeight: '300', letterSpacing: 2, textTransform: 'uppercase' },
  keyboardView: { flex: 1 },
  chatArea: { flex: 1 },
  chatContent: { padding: 24, paddingBottom: 40 },
  userMessage: { alignSelf: 'flex-end', backgroundColor: '#d97706', padding: 18, borderRadius: 24, borderBottomRightRadius: 6, maxWidth: '80%', marginBottom: 16, shadowColor: '#d97706', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  assistantMessage: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.05)', padding: 18, borderRadius: 24, borderBottomLeftRadius: 6, maxWidth: '80%', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  userMessageText: { color: '#ffffff', fontSize: 18, lineHeight: 26 },
  assistantMessageText: { color: '#e4e4e7', fontSize: 18, lineHeight: 26 },
  loadingContainer: { alignSelf: 'flex-start', padding: 10 },
  inputArea: { flexDirection: 'row', padding: 24, backgroundColor: 'rgba(20, 20, 25, 0.9)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', color: '#fafafa', paddingHorizontal: 24, paddingVertical: 18, borderRadius: 30, fontSize: 18, marginRight: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sendButton: { backgroundColor: '#d97706', justifyContent: 'center', paddingHorizontal: 30, borderRadius: 30, shadowColor: '#d97706', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  sendButtonText: { color: '#ffffff', fontWeight: '600', fontSize: 16, textTransform: 'uppercase', letterSpacing: 1 },
  configWarning: { backgroundColor: 'rgba(248, 113, 113, 0.12)', borderRadius: 16, padding: 16, margin: 16 },
  configWarningTitle: { color: '#fee2e2', fontWeight: '700', marginBottom: 6 },
  configWarningText: { color: '#f8d7da', fontSize: 14, lineHeight: 20 },
});
