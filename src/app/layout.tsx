import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dandiya Night 3.0 API Server',
  description: 'Backend API service for Dandiya Night 3.0 Event Ticketing Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#090308', color: '#fff' }}>
        {children}
      </body>
    </html>
  );
}
