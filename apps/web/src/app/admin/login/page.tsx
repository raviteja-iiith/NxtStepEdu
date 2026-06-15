'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { verifyAdminRole, updateAdminLogin } from './actions';

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError('Invalid email or password.');
        setLoading(false);
        return;
      }

      if (data.user) {
        // Verify user is admin using server action to bypass RLS recursion
        const userData = await verifyAdminRole(data.user.id);

        if (!userData || userData.role !== 'admin') {
          await supabase.auth.signOut();
          setError('Access denied. This portal is for administrators only.');
          setLoading(false);
          return;
        }

        if (!userData.is_active) {
          await supabase.auth.signOut();
          setError('Your account has been deactivated.');
          setLoading(false);
          return;
        }

        // Update last login
        await updateAdminLogin(data.user.id);
        router.push('/admin/dashboard');
      }
    } catch {
      setError('An unexpected error occurred.');
    }

    setLoading(false);
  };

  return (
    <div className="login-page">
      {/* Background */}
      <div className="landing-bg">
        <div className="orb orb-1" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.3) 0%, rgba(3,7,18,0) 70%)' }} />
        <div className="orb orb-2" style={{ background: 'radial-gradient(circle, rgba(30,58,138,0.3) 0%, rgba(3,7,18,0) 70%)' }} />
        <div className="grid-overlay" />
      </div>

      <div className="min-h-screen flex items-center justify-center p-6 relative z-10 w-full">
        <div className="w-full max-w-md animate-scale-in">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 text-4xl shadow-[0_0_40px_rgba(59,130,246,0.3)] border border-white/10" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))', backdropFilter: 'blur(20px)' }}>
              🛡️
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Admin Portal</h1>
            <p className="text-blue-300 font-medium tracking-wide uppercase text-xs">Super Administrator Access</p>
          </div>

          {/* Login Card */}
          <div className="login-card p-8 md:p-10">
            {error && (
              <div className="mb-6 p-4 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="form-group">
                <label className="form-label" htmlFor="admin-email">Email Address</label>
                <div className="input-wrapper">
                  <input
                    id="admin-email"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="form-input"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="admin-password">Password</label>
                <div className="input-wrapper">
                  <input
                    id="admin-password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="form-input"
                    required
                  />
                </div>
              </div>

              <button
                id="admin-login-submit"
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-2"
                style={{ background: loading ? '#334155' : 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}
              >
                {loading ? 'Authenticating...' : 'Sign In as Admin'}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-white/10 text-center">
              <p className="text-slate-500 text-xs">
                This is a restricted portal. Unauthorized access is strictly prohibited and logged.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
