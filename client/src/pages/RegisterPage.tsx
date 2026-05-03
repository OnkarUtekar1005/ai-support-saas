import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Eye, EyeOff } from 'lucide-react';

export function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ orgName: '', name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.orgName, form.email, form.password, form.name);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gray-950 items-center justify-center p-12">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-lg">T</span>
            </div>
            <div>
              <div className="text-white font-bold text-xl tracking-tight">Techview</div>
              <div className="text-gray-500 text-xs uppercase tracking-widest">CRM</div>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-white leading-tight">Get started in minutes</h2>
          <p className="text-gray-400 mt-4 leading-relaxed">
            Create your organization, invite your team, and start managing support tickets, CRM, and AI chatbots.
          </p>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm animate-page-in">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-sky-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">T</span>
            </div>
            <span className="font-bold text-gray-900">CRM of Techview</span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">Create account</h1>
          <p className="text-gray-500 text-sm mt-1">Set up your organization</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 px-4 py-2.5 rounded-lg text-sm border border-red-200 animate-fade-in">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1.5">Organization Name</label>
              <input value={form.orgName} onChange={update('orgName')} className="input-field" required placeholder="Acme Inc." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1.5">Your Name</label>
              <input value={form.name} onChange={update('name')} className="input-field" required placeholder="John Doe" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={update('email')} className="input-field" required placeholder="you@company.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={update('password')}
                  className="input-field pr-10"
                  required
                  minLength={8}
                  placeholder="Min 8 characters"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />}
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-sky-600 hover:underline font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
