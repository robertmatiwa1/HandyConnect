import type { GetServerSideProps } from "next";
import { Layout } from "../components/Layout";
import { isAuthenticatedFromCookies } from "../lib/auth";

interface ProviderVerificationProps {
  isAuthenticated: boolean;
}

const providers = [
  {
    id: "PRV-4411",
    name: "FixIt Pros",
    category: "Appliance Repair",
    status: "Background check in progress",
    submittedAt: "2023-09-30"
  },
  {
    id: "PRV-4412",
    name: "Sparkle Homes",
    category: "Home Cleaning",
    status: "Document review",
    submittedAt: "2023-09-29"
  }
];

export default function ProviderVerification({
  isAuthenticated
}: ProviderVerificationProps) {
  return (
    <Layout isAuthenticated={isAuthenticated}>
      <section>
        <h1 style={{ fontSize: "2.25rem", marginBottom: "1rem" }}>
          Provider Verification
        </h1>
        <p style={{ color: "#475569", maxWidth: "620px" }}>
          Validate new marketplace providers with compliance checks, document
          reviews, and onboarding tasks before activating them for jobs.
        </p>
        <div
          style={{
            marginTop: "2rem",
            background: "white",
            padding: "1.5rem",
            borderRadius: 16
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b" }}>
                <th style={{ paddingBottom: "0.75rem" }}>Application</th>
                <th>Provider</th>
                <th>Category</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr
                  key={provider.id}
                  style={{ borderTop: "1px solid #e2e8f0" }}
                >
                  <td style={{ padding: "0.75rem 0" }}>{provider.id}</td>
                  <td>{provider.name}</td>
                  <td>{provider.category}</td>
                  <td>{provider.status}</td>
                  <td>{provider.submittedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps<
  ProviderVerificationProps
> = async ({ req }) => {
  const isAuthenticated = isAuthenticatedFromCookies(req.cookies);

  if (!isAuthenticated) {
    return {
      redirect: {
        destination: "/login",
        permanent: false
      }
    };
  }

  return {
    props: {
      isAuthenticated
    }
  };
};
