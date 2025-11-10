import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { Layout } from "../components/Layout";
import { credentialsHint, isAuthenticatedFromCookies } from "../lib/auth";

interface HomeProps {
  isAuthenticated: boolean;
}

export default function Home({ isAuthenticated }: HomeProps) {
  return (
    <Layout isAuthenticated={isAuthenticated}>
      <Head>
        <title>HandyConnect Ops Portal</title>
      </Head>
      <section>
        <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>
          Operations Control Center
        </h1>
        <p style={{ maxWidth: "620px", color: "#475569" }}>
          Monitor, triage, and resolve customer and provider issues from a single
          secure workspace. Sign in to access dispute resolution tooling, manage
          refund workflows, and validate new providers before they go live on the
          HandyConnect marketplace.
        </p>
        <div style={{ marginTop: "2rem" }}>
          {isAuthenticated ? (
            <div className="success">
              You are signed in. Use the navigation to access workflow dashboards.
            </div>
          ) : (
            <div className="alert">
              You must sign in to access the operations tooling. Use the demo
              credentials <strong>{credentialsHint.email}</strong> /{" "}
              <strong>{credentialsHint.password}</strong>.
            </div>
          )}
        </div>
        <div className="card-grid">
          <Link href="/disputes" className="card">
            <h2>Disputes</h2>
            <p>
              Track chargebacks and customer complaints, collaborate with finance,
              and manage escalations with a structured review workflow.
            </p>
          </Link>
          <Link href="/refunds" className="card">
            <h2>Refunds</h2>
            <p>
              Approve or deny refund requests with configurable policies, required
              evidence, and automated communication templates.
            </p>
          </Link>
          <Link href="/provider-verification" className="card">
            <h2>Provider Verification</h2>
            <p>
              Vet new providers with document collection, background checks, and
              compliance tracking before scheduling their first job.
            </p>
          </Link>
        </div>
      </section>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async ({ req }) => {
  const isAuthenticated = isAuthenticatedFromCookies(req.cookies);

  return {
    props: {
      isAuthenticated
    }
  };
};
