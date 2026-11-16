import './globals.css';
import './glass.css';
import './redesign.css';
import { Fraunces, Manrope } from 'next/font/google';

// Self-hosted at build time by Next.js: no font requests to Google from visitors' browsers.
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap', weight: ['500', '600', '700'] });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });

const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
export const metadata = {
  metadataBase: new URL(base),
  title: { default: 'Baptist Academy Jimeta Yola', template: '%s | Baptist Academy' },
  description: 'Basic and Secondary education in Jimeta, Yola. School portal for parents and staff.',
  openGraph: { title: 'Baptist Academy Jimeta Yola', description: 'Strive for Excellence. Basic and Secondary education in Jimeta, Yola.', images: ['/logo.jpeg'], type: 'website' },
  icons: { icon: '/logo.jpeg', apple: '/logo.jpeg' },
};
export const viewport = { themeColor: '#0E2252', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies a saved theme before the first paint so the page never flashes the wrong colours. */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
