import type { Metadata } from 'next';
import { Outfit, Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: 'SIP-FNC — Sistema de Información de Proyectos',
  description: 'Gestión e informes contables por periodos — Comité Departamental de Cafeteros del Tolima',
};

// Fuentes autohospedadas (cero @import bloqueante a Google Fonts)
const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-headline-next' });
const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-body-next' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={`${outfit.variable} ${inter.variable}`}>
      <body>
        <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
