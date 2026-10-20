import React, { useState, useEffect } from 'react';
import { User, Group } from './types';
import { dataService } from './services/api';
import { isConfigured, auth } from './services/firebase';
import { onIdTokenChanged } from 'firebase/auth';
import {doc,onSnapshot} from 'firebase/firestore';
import {db} from './services/firebase';
import {MEMBER_ACCESS_ENABLED} from './services/features';
import RequiredPasswordChange from './components/RequiredPasswordChange';
import {validLodgeLogo} from './services/lodgeIdentity';
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
import { ReadOnlyProvider } from './contexts/ReadOnlyContext';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState('home');
  const [loading, setLoading] = useState(true);

  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupSuspended, setGroupSuspended] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupLogo,setGroupLogo] = useState('');
  const [needsPasswordChange,setNeedsPasswordChange] = useState(false);

  if (!isConfigured) {
    return <Setup />;
  }

  useEffect(() => {
    let stopSecurity = () => {};
    let session = 0;
    let securityVersion = 0;
    let observedUid: string | null = null;
    const unsubscribe = onIdTokenChanged(auth, firebaseUser => {
      const current = ++session;
      stopSecurity();
      const switchingAccount = (firebaseUser?.uid || null) !== observedUid;
      observedUid = firebaseUser?.uid || null;
      if (switchingAccount) setLoading(true);
      if (!firebaseUser) { setUser(null); setNeedsPasswordChange(false); localStorage.removeItem('logia_session'); setLoading(false); return; }
      if (!MEMBER_ACCESS_ENABLED) {
        setNeedsPasswordChange(false);
        dataService.getUserProfile(firebaseUser.uid).then(profile=>{
          if(current!==session)return;
          setUser(profile ? {...profile,uid:firebaseUser.uid} : null);
          if(profile)localStorage.setItem('logia_session',JSON.stringify(profile));
        }).catch(()=>{if(current===session)setUser(null);}).finally(()=>{if(current===session)setLoading(false);});
        return;
      }
      stopSecurity = onSnapshot(doc(db,'accountSecurity',firebaseUser.uid), async snapshot => {
        const version=++securityVersion;
        if (current !== session) return;
        if (snapshot.data()?.mustChangePassword) { setNeedsPasswordChange(true); setUser(null); localStorage.removeItem('logia_session'); setLoading(false); return; }
        setNeedsPasswordChange(false);
        try {
          const profile = await dataService.getUserProfile(firebaseUser.uid);
          if (current !== session || version !== securityVersion) return;
          setUser(profile ? { ...profile, uid: firebaseUser.uid } : null);
          if (profile) localStorage.setItem('logia_session', JSON.stringify(profile));
        } catch { if (current === session && version === securityVersion) setUser(null); }
        finally { if (current === session && version === securityVersion) setLoading(false); }
      }, () => { if (current === session) {setUser(null);setNeedsPasswordChange(false);setLoading(false);} });
    });
    return () => {session++;stopSecurity();unsubscribe();};
  }, []);

  const handleLogin = (loggedUser: User) => {
    setUser(loggedUser);
    setNeedsPasswordChange(!!loggedUser.requirePasswordChange);
    setView('home');
    setSelectedGroup(null);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (viewParam) {
      // Preserve old trivia links by redirecting them to the restored library.
      setView(viewParam === 'trivia' ? 'library' : viewParam);
      window.history.replaceState({}, '', '/');
    }

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data.view) {
        setView(event.data.view === 'trivia' ? 'library' : event.data.view);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
  }, []);

  useEffect(() => {
    const groupId=selectedGroup?.id || user?.groupId;
    setGroupName(selectedGroup?.name || '');setGroupLogo('');
    if(!groupId){setGroupSuspended(false);return;}
    return onSnapshot(doc(db,'groups',groupId),snapshot=>{
      const group=snapshot.exists()?{...snapshot.data(),id:snapshot.id} as Group:null;
      setGroupSuspended(user?.role!=='master' && group?.active===false);
      setGroupName(group?.name || selectedGroup?.name || '');
      setGroupLogo(group && validLodgeLogo(group) ? group.logoImageUrl || '' : '');
    },()=>setGroupSuspended(user?.role!=='master'));
  }, [user?.uid,user?.groupId,user?.role,selectedGroup?.id]);

  const handleLogout = () => {
    void auth.signOut();
    setUser(null);
    setSelectedGroup(null);
    setNeedsPasswordChange(false);
  };

  if (needsPasswordChange && auth.currentUser) return <RequiredPasswordChange onLogout={handleLogout}/>;

  if (loading) {
    return <div className="min-h-screen bg-logia-900 flex items-center justify-center text-white">Cargando...</div>;
  }

  if (!user) return <Auth onLogin={handleLogin} />;

  if (user.role === 'master' && !selectedGroup) {
    return <MasterDashboard onSelectGroup={setSelectedGroup} onLogout={handleLogout} />;
  }

  const activeUserContext = { ...user };
  if (user.role === 'master' && selectedGroup) activeUserContext.groupId = selectedGroup.id;

  if (!activeUserContext.active && activeUserContext.role !== 'master') {
    return <PendingApproval user={activeUserContext} onLogout={handleLogout} />;
  }

  const isAdminOrViewer = ['admin', 'viewer', 'master'].includes(activeUserContext.role);

  return (
    <ReadOnlyProvider value={groupSuspended}>
      <Layout
        user={activeUserContext}
        currentView={view}
        onNavigate={setView}
        onLogout={handleLogout}
        onExitGroup={user.role === 'master' ? () => setSelectedGroup(null) : undefined}
        suspended={groupSuspended}
        groupName={groupName}
        groupLogo={groupLogo}
      >
        {view === 'home' && <Dashboard user={activeUserContext} />}
        {view === 'notices' && <Notices user={activeUserContext} />}
        {view === 'payments' && <Payments user={activeUserContext} />}
        {view === 'attendance' && <Attendance user={activeUserContext} />}
        {view === 'library' && <Library user={activeUserContext} />}
        {view === 'profile' && <Profile user={activeUserContext} />}
        {view === 'admin' && isAdminOrViewer && <Admin user={activeUserContext} />}
        {view === 'admin' && !isAdminOrViewer && (
          <div className="p-8 text-center text-red-400">Acceso denegado. Solo Admin.</div>
        )}
      </Layout>
    </ReadOnlyProvider>
  );
};

export default App;
