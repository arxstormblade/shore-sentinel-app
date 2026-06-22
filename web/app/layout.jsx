import './globals.css';import {Shell} from '@/components/ui';
export const metadata={title:'Shore Sentinel',description:'Security scanning, audit history, managed inventory, reports, and remediation control plane.'};
export default function RootLayout({children}){return <html lang='en'><body><Shell>{children}</Shell></body></html>}
