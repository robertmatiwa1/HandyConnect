import type { GetServerSideProps } from "next";

import { Layout } from "../components/Layout";
import { fetchFromBackend } from "../lib/backend";
import { getAuthTokenFromCookies, isAuthenticatedFromCookies } from "../lib/auth";
import { formatCurrency } from "../lib/format";
import { OpsProviderVerification } from "../lib/types";

interface ProviderVerificationProps {
  isAuthenticated: boolean;
  providers: OpsProviderVerification[];
}

export default function ProviderVerification({ isAuthenticated, providers }: ProviderVerificationProps) {
  return (
    <Layout isAuthenticated={isAuthenticated}>
      <section>
        <h1 style={{ fontSize: "2.25rem", marginBottom: "1rem" }}>Provider Verification</h1>
        <p style={{ color: "#475569", maxWidth: "620px" }}>
          Validate new marketplace providers with compliance checks, document reviews, and onboarding tasks before
          activating them for jobs.
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
                <th style={{ paddingBottom: "0.75rem" }}>Provider</th>
                <th>Skill</th>
                <th>Suburb</th>
                <th>Hourly rate</th>
                <th>Rating</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr key={provider.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "0.75rem 0" }}>{provider.name}</td>
                  <td>{provider.skill}</td>
                  <td>{provider.suburb}</td>
                  <td>{provider.hourlyRate ? formatCurrency(provider.hourlyRate) : "TBC"}</td>
                  <td>
                    {provider.rating ? (
                      <span>
                        {provider.rating.toFixed(1)} ({provider.ratingCount} reviews)
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>No reviews</span>
                    )}
                  </td>
                  <td>{provider.verified ? "Verified" : "Pending"}</td>
                </tr>
              ))}
              {providers.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "#64748b" }}>
                    No provider applications found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps<ProviderVerificationProps> = async ({ req }) => {
  const cookies = req.cookies;
  const token = getAuthTokenFromCookies(cookies);
  const isAuthenticated = isAuthenticatedFromCookies(cookies);

  if (!token || !isAuthenticated) {
    return {
      redirect: {
        destination: "/login",
        permanent: false
      }
    };
  }

  try {
    const data = await fetchFromBackend<{ providers: OpsProviderVerification[] }>(
      "/ops/provider-verifications",
      token
    );

    return {
      props: {
        isAuthenticated: true,
        providers: data.providers
      }
    };
  } catch (error) {
    console.error("Failed to load provider verifications", error);
    if (error instanceof Error && error.message.includes("status 401")) {
      return {
        redirect: {
          destination: "/login",
          permanent: false
        }
      };
    }

    return {
      props: {
        isAuthenticated: true,
        providers: []
      }
    };
  }
};
