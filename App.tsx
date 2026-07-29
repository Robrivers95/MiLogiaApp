import React, { useState, useEffect } from 'react';
import { User, Group } from './types';
import { dataService } from './services/api';
import { installFinancialStatsFix } from './services/installFinancialStatsFix';
import { isConfigured, auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import Auth from './components/Auth';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Payments from './components/Payments';
import Attendance from './components/Attendance';
import Admin from './components/Admin';
import Profile from './components/Profile';
import Setup from './components/Setup';
import Notices from './components/Notices';
import MasterDashboard from './components/MasterDashboard';
import PendingApproval from './components/PendingApproval';
import Library from './components/Library';
import AdminAIAssistant from './components/AdminAIAssistant';
import AdminMemberReceipts from './components/AdminMemberReceipts';
import CompactExtraFeeAssignment from './components/CompactExtraFeeAssignment';
import { ReadOnlyProvider } from './contexts/ReadOnlyContext';

installFinancialStatsFix();

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState('home');
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupSuspended, setGroupSuspended] = useState(false);
  const [groupName, setGroupName] = useState('');

  if (!isConfigured) return <Setup />;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      if (firebaseUser) {
        try {
          const profile = await dataService.getUserProfile(firebaseUser.uid);
          if (profile) {
            setUser({ ...profile, uid: firebaseUser.uid });
            localStorage.setItem('logia_session', JSON.stringify(profile));
          } else {
            console.warn('User authenticated but no profile found.');
            setUser(null);
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
          setUser(null);
        }
      } else {
        setUser(null);
        localStorage.removeItem('logia_session');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = (loggedUser: User) => {
    setUser(loggedUser);
    setView('home');
    setSelectedGroup(null);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (viewParam) {
      setView(viewParam === 'trivia' ? 'library' : viewParam);
      window.history.replaceState({}, '', '/');
    }
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data.view) setView(event.data.view === 'trivia' ? 'library' : event.data.view);
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
  }, []);

  useEffect(() => {
    const checkGroupStatus = async () => {
      const groupId = selectedGroup?.id || user?.groupId;
      if (selectedGroup?.name) setGroupName(selectedGroup.name);
      if (!groupId || user?.role === 'master') {
        setGroupSuspended(false);
        return;
      }
      try {
        const group = await dataService.getGroupDetails(groupId);
        setGroupSuspended(group?.active === false);
        if (group?.name) setGroupName(group.name);
      } catch {
        setGroupSuspended(false);
      }
    };
    void checkGroupStatus();
  }, [user, selectedGroup]);

  const handleLogout = () => {
    void auth.signOut();
    setUser(null);
    setSelectedGroup(null);
  };

  if (loading) return <div className="min-h-screen bg-logia-900 flex items-center justify-center text-white">Cargando...</div>;
  if (!user) return <Auth onLogin={handleLogin} />;
  if (user.role === 'master' && !selectedGroup) return <MasterDashboard onSelectGroup={setSelectedGroup} onLogout={handleLogout} />;

  const activeUserContext = { ...user };
  if (user.role === 'master' && selectedGroup) activeUserContext.groupId = selectedGroup.id;
  if (!activeUserContext.active && activeUserContext.role !== 'master') return <PendingApproval user={activeUserContext} onLogout={handleLogout} />;

  const isAdminOrViewer = ['admin', 'viewer', 'master'].includes(activeUserContext.role);

  return (
    <ReadOnlyProvider value={groupSuspended}>
      <Layout user={activeUserContext} currentView={view} onNavigate={setView} onLogout={handleLogout} onExitGroup={user.role === 'master' ? () => setSelectedGroup(null) : undefined} suspended={groupSuspended} groupName={groupName}>
        {view === 'home' && <Dashboard user={activeUserContext} />}
        {view === 'notices' && <Notices user={activeUserContext} />}
        {view === 'payments' && <Payments user={activeUserContext} />}
        {view === 'attendance' && <Attendance user={activeUserContext} />}
        {view === 'library' && <Library user={activeUserContext} />}
        {view === 'profile' && <Profile user={activeUserContext} />}
        {view === 'admin' && isAdminOrViewer && <Admin user={activeUserContext} />}
        {view === 'admin' && !isAdminOrViewer && <div className="p-8 text-center text-red-400">Acceso denegado. Solo Admin.</div>}
      </Layout>
      <AdminMemberReceipts user={activeUserContext} currentView={view} />
      <CompactExtraFeeAssignment user={activeUserContext} currentView={view} />
      <AdminAIAssistant user={activeUserContext} onNavigate={setView} />
    </ReadOnlyProvider>
  );
};

export default App;
