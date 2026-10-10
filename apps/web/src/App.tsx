import { useState, useEffect } from 'react';
import { api } from './api.js';
import type { User, TenantMembership } from './types.js';
import { AuthPage } from './pages/AuthPage.js';
import { Navbar } from './components/Navbar.js';
import { DashboardPage } from './pages/DashboardPage.js';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tenants, setTenants] = useState<TenantMembership[]>([]);
  const [activeTenant, setActiveTenant] = useState<TenantMembership | null>(null);
  const [loading, setLoading] = useState(true);

  // Check existing session
  useEffect(() => {
    async function initSession() {
      if (api.getToken()) {
        try {
          const data = await api.getMe();
          setUser(data.user);
          setTenants(data.tenants);
          if (data.tenants.length > 0) {
            setActiveTenant(data.tenants[0]!);
          }
        } catch {
          api.setToken(null);
        }
      }
      setLoading(false);
    }
    initSession();
  }, []);

  const handleAuthSuccess = (authUser: User, authTenants: TenantMembership[]) => {
    setUser(authUser);
    setTenants(authTenants);
    if (authTenants.length > 0) {
      setActiveTenant(authTenants[0]!);
    }
  };

  const handleLogout = () => {
    api.setToken(null);
    setUser(null);
    setTenants([]);
    setActiveTenant(null);
  };

  const handleCreateTenant = async (name: string) => {
    try {
      const newTenant = await api.createTenant(name);
      const updated = [...tenants, newTenant];
      setTenants(updated);
      setActiveTenant(newTenant);
    } catch (err: any) {
      alert(err.message || 'Failed to create workspace');
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        color: 'var(--text-muted)',
      }}>
        Loading OpenAgent session...
      </div>
    );
  }

  if (!user || !activeTenant) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <>
      <Navbar
        user={user}
        tenants={tenants}
        activeTenant={activeTenant}
        onSelectTenant={setActiveTenant}
        onCreateTenant={handleCreateTenant}
        onLogout={handleLogout}
      />
      <DashboardPage tenant={activeTenant} />
    </>
  );
}

export default App;
