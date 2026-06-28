import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { extractMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { Button, Checkbox, Field, Icon, Input } from '@/components/ui';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export default function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password, remember);
      toast.success('Welcome back', 'Authentication successful.');
      navigate('/', { replace: true });
    } catch (err) {
      const msg = extractMessage(err, 'Invalid email or password');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Brand panel */}
        <div className="relative hidden overflow-hidden bg-primary lg:flex lg:w-[45%]">
          <div className="absolute inset-0 opacity-[0.07]">
            <div
              className="h-full w-full"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
            />
          </div>
          <div className="relative z-10 flex flex-col justify-between p-12 text-on-primary">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white">
                <img src="/st-logo.png" alt="Stationery Management System" className="h-full w-full object-contain p-0.5" />
              </div>
              <span className="text-h2 font-bold">STMS</span>
            </div>
            <div>
              <h2 className="text-[40px] font-bold leading-tight tracking-tight">
                Run your stationery & printing business with precision.
              </h2>
              <p className="mt-4 max-w-md text-body-lg text-on-primary/70">
                Point of sale, inventory, cash sessions, expenses, and real-time
                profit reporting — unified in one professional console.
              </p>
            </div>
            <div className="flex items-center gap-6 text-on-primary/70">
              <Feature icon="point_of_sale" label="Fast POS" />
              <Feature icon="inventory" label="FIFO Inventory" />
              <Feature icon="account_balance" label="Cash Control" />
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-[420px]">
            <div className="mb-8 text-center lg:hidden">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
                <img src="/st-logo.png" alt="Stationery Management System" className="h-full w-full object-contain p-0.5" />
              </div>
              <h1 className="text-h1 font-bold text-primary">STMS</h1>
            </div>

            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 shadow-xl">
              <div className="mb-6">
                <h2 className="text-h2 font-semibold text-on-surface">Secure Access</h2>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  Sign in to your STMS workspace.
                </p>
              </div>

              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-error/30 bg-error-container/50 px-4 py-3 text-on-error-container">
                  <Icon name="error" size={20} className="text-error" />
                  <p className="text-body-sm font-medium">{error}</p>
                </div>
              )}

              <form className="space-y-4" onSubmit={onSubmit}>
                <Field label="Email address" htmlFor="email" required>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    leftIcon="mail"
                    placeholder="admin@kjstationery.co.tz"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Field>

                <Field label="Password" htmlFor="password" required>
                  <div className="relative">
                    <Icon
                      name="lock"
                      size={20}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                    />
                    <input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-lowest pl-10 pr-10 text-body-sm text-on-surface outline-none transition-all focus:border-secondary focus:ring-2 focus:ring-secondary/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-on-surface-variant hover:bg-surface-container"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      <Icon name={showPw ? 'visibility_off' : 'visibility'} size={20} />
                    </button>
                  </div>
                </Field>

                <div className="flex items-center justify-between">
                  <Checkbox
                    id="remember"
                    label="Remember this device"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      toast.info('Contact your administrator', 'Password resets are handled by an admin.')
                    }
                    className="text-[13px] font-semibold text-secondary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button type="submit" size="lg" fullWidth loading={loading} iconRight="arrow_forward">
                  Sign In
                </Button>
              </form>

              <div className="mt-6 border-t border-outline-variant pt-4 text-center">
                <p className="text-body-sm text-on-surface-variant">
                  Trouble logging in?{' '}
                  <button
                    onClick={() => toast.info('Support', 'Reach support at klikcelltechnologiesltd@gmail.com')}
                    className="font-semibold text-secondary hover:underline"
                  >
                    Contact Support
                  </button>
                </p>
              </div>
            </div>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-label-caps uppercase tracking-wide text-on-surface-variant">
              <Icon name="verified_user" size={16} /> SSL encrypted secure connection
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} size={20} />
      <span className="text-body-sm font-medium">{label}</span>
    </div>
  );
}
