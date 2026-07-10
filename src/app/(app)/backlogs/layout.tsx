/**
 * Hosts the @modal parallel slot next to the Backlogs pages. {modal} is null
 * (default.tsx) except when a soft navigation to /backlogs/[backlogId] is
 * intercepted into the shelf-zoom overlay — a hard nav / refresh of the same
 * URL renders the full page in {children} instead.
 */
export default function BacklogsLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
