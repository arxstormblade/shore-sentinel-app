import { Header, Pill } from '@/components/ui';
import { DisplayPreferencesPanel } from '@/components/display-preferences';

export const metadata = {
  title: 'Display preferences | Shore Sentinel',
  description: 'Adjust density, contrast, and visual effects for the Shore Sentinel control plane.',
};

export default function PreferencesPage() {
  return (
    <div className="stack">
      <Header
        eye="Display controls"
        title="Display preferences"
        desc="Set the control plane to match the way you review data. Comfortable spacing, compact density, high contrast, and reduced effects are all available here."
      >
        <Pill>Browser-local</Pill>
        <Pill>Persistent</Pill>
      </Header>
      <DisplayPreferencesPanel />
    </div>
  );
}
