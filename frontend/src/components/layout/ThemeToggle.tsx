import { useTheme } from '@/providers/ThemeProvider';
import { Icon } from '@/components/ui';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container"
      aria-label="Toggle theme"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size={22} />
    </button>
  );
}
