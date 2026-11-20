import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'ZSKazik Casino', description: 'On-chain casino: CoinFlip, Dice, Plinko' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0b0e17', color: '#eef1ff', fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
