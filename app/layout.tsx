import type { Metadata } from 'next';
import { Mulish } from 'next/font/google';

import './globals.css';

import GoogleAnalytics from '@/components/google-analytics';
import Nav from '@/components/nav';

const mulish = Mulish({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AfyaNzima',
  description: 'Ishi maisha yenye afya',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="text-screen-sm sm:text-screen">
      <body className={mulish.className}>
        <GoogleAnalytics />
        <Nav />
        {children}
      </body>
    </html>
  );
}
