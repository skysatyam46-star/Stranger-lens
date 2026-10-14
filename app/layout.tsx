import type { Metadata, Viewport } from 'next';
import './globals.css'; // Global styles

export const viewport: Viewport = {
  themeColor: '#090D15',
  colorScheme: 'dark',
};

export const metadata: Metadata = {
  title: 'StrangerLens — AI Website First-Impression Analyzer',
  description: "See your website through a stranger's eyes. Get an AI-powered first-impression clarity review to discover what's unclear and how to improve.",
  openGraph: {
    title: 'StrangerLens — AI Website First-Impression Analyzer',
    description: "See your website through a stranger's eyes. Get an AI-powered first-impression clarity review to discover what's unclear and how to improve.",
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StrangerLens — AI Website First-Impression Analyzer',
    description: "See your website through a stranger's eyes. Get an AI-powered first-impression clarity review to discover what's unclear and how to improve.",
  },
  other: {
    'color-scheme': 'dark',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html
      lang="en"
      className="dark bg-[#090D15] text-[#F1F5F9]"
      style={{ backgroundColor: '#090D15', colorScheme: 'dark' }}
    >
      <head>
        <meta name="theme-color" content="#090D15" />
        <meta name="color-scheme" content="dark" />
        <style
          dangerouslySetInnerHTML={{
            __html: `html,body{background-color:#090D15!important;color:#F1F5F9;color-scheme:dark;}`,
          }}
        />
      </head>
      <body
        className="bg-[#090D15] text-[#F1F5F9] min-h-screen"
        style={{ backgroundColor: '#090D15', colorScheme: 'dark' }}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
