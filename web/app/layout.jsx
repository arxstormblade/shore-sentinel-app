import './globals.css';
import { Shell } from '@/components/ui';
import { displayPreferencesBootstrapScript } from '@/lib/display-preferences';

export const metadata = {
  title: 'Shore Sentinel',
  description: 'Security scanning, audit history, managed inventory, reports, and remediation control plane.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: displayPreferencesBootstrapScript() }} />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
