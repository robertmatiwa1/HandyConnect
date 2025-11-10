import Link from "next/link";
import { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
  isAuthenticated: boolean;
}

const navLinks = [
  { href: "/disputes", label: "Disputes" },
  { href: "/refunds", label: "Refunds" },
  { href: "/provider-verification", label: "Provider Verification" }
];

export function Layout({ children, isAuthenticated }: LayoutProps) {
  return (
    <>
      <header style={{ background: "white", borderBottom: "1px solid #e2e8f0" }}>
        <nav
          style={{
            maxWidth: "960px",
            margin: "0 auto",
            padding: "1.5rem 1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <Link href="/">
            <span style={{ fontWeight: 700, fontSize: "1.25rem" }}>
              HandyConnect Ops Portal
            </span>
          </Link>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} style={{ fontWeight: 500 }}>
                {link.label}
              </Link>
            ))}
            {isAuthenticated ? (
              <form action="/api/logout" method="post">
                <button type="submit">Sign out</button>
              </form>
            ) : (
              <Link href="/login" style={{ fontWeight: 600 }}>
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}
