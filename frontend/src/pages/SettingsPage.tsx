import { useState } from 'react';
import { Badge, Card, CardBody, CardHeader, Icon, PageHeader, Tabs } from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { cn, initials } from '@/lib/utils';

type TabKey = 'preferences';

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>('preferences');

  const items = [{ value: 'preferences' as const, label: 'Preferences', icon: 'tune' }];

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader title="Settings" description="Configure your interface and view your profile." />
      <Tabs value={tab} onChange={(v) => setTab(v as TabKey)} items={items} />

      {tab === 'preferences' && <PreferencesTab />}
    </div>
  );
}

function PreferencesTab() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  return (
    <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
      <Card>
        <CardHeader title="Appearance" subtitle="Choose your interface theme" />
        <CardBody>
          <div className="grid grid-cols-2 gap-3">
            {(['light', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                  theme === t ? 'border-secondary bg-secondary-container/30' : 'border-outline-variant hover:bg-surface-container-low',
                )}
              >
                <Icon name={t === 'light' ? 'light_mode' : 'dark_mode'} size={26} className={theme === t ? 'text-secondary' : 'text-on-surface-variant'} />
                <span className="text-body-sm font-semibold capitalize">{t} mode</span>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your Profile" />
        <CardBody>
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-h3 font-bold text-on-primary">
              {user ? initials(user.fullName) : '—'}
            </span>
            <div>
              <p className="text-body-lg font-semibold text-on-surface">{user?.fullName}</p>
              <p className="text-body-sm text-on-surface-variant">{user?.email}</p>
              <Badge tone={user?.role === 'ADMIN' ? 'navy' : 'neutral'} className="mt-1">{user?.role}</Badge>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-surface-container-low p-3 text-[13px] text-on-surface-variant">
            <Icon name="info" size={16} className="mr-1" />
            Contact an administrator to change your role or reset your password.
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
