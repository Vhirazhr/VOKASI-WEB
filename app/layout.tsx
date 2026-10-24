import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VOKASI Web — Belajar. Berlatih. Berkembang.',
  description: 'Platform latihan numerasi vokasi berbasis web untuk siswa dan admin sekolah.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
