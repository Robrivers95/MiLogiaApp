
import React, { useState, useEffect } from 'react';
import { User, Group } from './types';
import { dataService } from './services/api';
import { isConfigured, auth } from './services/firebase'; 
import { onAuthStateChanged } from "firebase/auth";
import Auth from './components/Auth';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Payments from './components/Payments';
import Attendance from './components/Attendance';
// import RPG from './components/RPG'; // Hidden
import Trivia from './components/Trivia';
import Admin from './components/Admin';
import Profile from './components/Profile';
import Setup from './components/Setup'; 
import Notices from './components/Notices';
import MasterDashboard from './components/MasterDashboard';
import PendingApproval from './components/PendingApproval';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState('home');
  const [loading, setLoading] = useState(true);
  
  // State for Master Admin Multi-Tenancy
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  if (!isConfigured) {
    return <Setup />;
  }

  useEffect(() => {
    // Listen for auth state changes directly from Firebase
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is authenticated, now fetch their profile data from Firestore
        try {
          const profile = await dataService.getUserProfile(firebaseUser.uid);
          if (profile) {
            setUser(profile);
            // Also cache to local storage for offline checks if needed
            localStorage.setItem('logia_session', JSON.stringify(profile));
          } else {
            console.warn("User authenticated but no profile found.");
            setUser(null);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
          setUser(null);
        }
      } else {
        // User is signed out
        setUser(null);
        localStorage.removeItem('logia_session');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = (u: User) => {
    setUser(u);
    setView('home');
    setSelectedGroup(null); // Reset group selection on fresh login
  };

  const handleLogout = () => {
    auth.signOut();
    setUser(null);
    setSelectedGroup(null);
  };

  if (loading) return <div className="min-h-screen bg-logia-900 flex items-center justify-center text-white">Cargando...</div>;

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  // LOGIC FOR MASTER ADMIN
  // If user is master AND hasn't selected a group yet, show the Master Dashboard
  if (user.role === 'master' && !selectedGroup) {
      return <MasterDashboard 
        onSelectGroup={setSelectedGroup}
        onLogout={handleLogout}
      />;
    }

  // PREPARE USER CONTEXT
  // If Master has selected a group, we temporarily "act" as if the master belongs to that group for the UI components
  // If Regular user, we use their native groupId
  const activeUserContext = { ...user };
  if (user.role === 'master' && selectedGroup) {
      activeUserContext.groupId = selectedGroup.id;
  }

  // --- STRICT ACCESS CONTROL ---
  // If user is NOT active AND is NOT a master/admin (who might be setting things up), BLOCK THEM.
  // Exception: Admin/Master roles are implicitly trusted or can activate themselves via DB if needed, 
  // but strictly speaking, a new registration is 'member' and 'active: false'.
  if (!activeUserContext.active && activeUserContext.role !== 'master') {
      return <PendingApproval user={activeUserContext} onLogout={handleLogout} />;
  }
  // -----------------------------

  const isAdminOrViewer = activeUserContext.role === 'admin' || activeUserContext.role === 'viewer' || activeUserContext.role === 'master';

  return (
    <Layout 
        user={activeUserContext} 
        currentView={view} 
        onNavigate={setView} 
        onLogout={handleLogout}
        onExitGroup={user.role === 'master' ? () => setSelectedGroup(null) : undefined}
    >
      {view === 'home' && <Dashboard user={activeUserContext} />}
      {view === 'notices' && <Notices user={activeUserContext} />}
      {view === 'payments' && <Payments user={activeUserContext} />}
      {view === 'attendance' && <Attendance user={activeUserContext} />}
      {/* {view === 'rpg' && <RPG user={activeUserContext} onUpdateUser={() => {}} />} */}
      {view === 'trivia' && <Trivia user={activeUserContext} />}
      {view === 'profile' && <Profile user={activeUserContext} />}
      {view === 'admin' && isAdminOrViewer && <Admin user={activeUserContext} />}
      
      {view === 'admin' && !isAdminOrViewer && (
        <div className="p-8 text-center text-red-400">Acceso denegado. Solo Admin.</div>
      )}
    </Layout>
  );
};

export default App;
