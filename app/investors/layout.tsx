import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PaaS Investor Overview · AfyaNzima',
  robots: { index: false, follow: false },
};

export default function InvestorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
