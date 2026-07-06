/** Public, pre-signup shell — no auth gate, no app nav (F3.1 landing). */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
