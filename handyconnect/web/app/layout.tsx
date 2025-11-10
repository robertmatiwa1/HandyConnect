import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'HandyConnect',
  description: 'Find trusted local tradespeople and manage your bookings.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="app-shell">
            <header className="app-header">
              <h1>HandyConnect</h1>
              <nav>
                <Link href="/" style={{ marginRight: 16 }}>Home</Link>
                <Link href="/dashboard">Dashboard</Link>
              </nav>
            </header>
            <main className="app-main">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
