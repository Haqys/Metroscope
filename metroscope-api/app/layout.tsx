/**
 * The API service renders no UI. Next.js requires a root layout to exist,
 * so this is deliberately minimal. There are no pages, no CSS, and no
 * React components anywhere in this project (doc 04 section 0.1).
 */
export const metadata = { title: 'Metroscope API', robots: { index: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
