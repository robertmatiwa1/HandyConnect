import type { GetServerSideProps } from "next";

import { Layout } from "../components/Layout";
import { fetchFromBackend } from "../lib/backend";
import { getAuthTokenFromCookies, isAuthenticatedFromCookies } from "../lib/auth";
import { formatCurrency } from "../lib/format";
import { OpsDispute } from "../lib/types";

interface DisputesProps {
  isAuthenticated: boolean;
  disputes: OpsDispute[];
}

const statusCopy: Record<string, string> = {
  OPEN: "Open",
  AWAITING_MERCHANT_EVIDENCE: "Awaiting merchant evidence",
  CHARGEBACK_FILED: "Chargeback filed",
  WON: "Won",
  LOST: "Lost"
};

export default function Disputes({ isAuthenticated, disputes }: DisputesProps) {
  return (
    <Layout isAuthenticated={isAuthenticated}>
      <section>
        <h1 style={{ fontSize: "2.25rem", marginBottom: "1rem" }}>Dispute Resolution</h1>
        <p style={{ color: "#475569", maxWidth: "620px" }}>
          Review open customer disputes, gather supporting documentation, and coordinate with payment processors to
          minimize financial exposure.
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
                <th style={{ paddingBottom: "0.75rem" }}>Case</th>
                <th>Customer</th>
                <th>Provider</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {disputes.map((dispute) => (
                <tr key={dispute.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "0.75rem 0" }}>{dispute.id}</td>
                  <td>{dispute.customerName}</td>
                  <td>{dispute.providerName}</td>
                  <td>{formatCurrency(dispute.amountCents / 100)}</td>
                  <td>{statusCopy[dispute.status] ?? dispute.status}</td>
                  <td>{new Date(dispute.submittedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {disputes.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "#64748b" }}>
                    No disputes have been logged.
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

export const getServerSideProps: GetServerSideProps<DisputesProps> = async ({ req }) => {
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
    const data = await fetchFromBackend<{ disputes: OpsDispute[] }>("/ops/disputes", token);

    return {
      props: {
        isAuthenticated: true,
        disputes: data.disputes
      }
    };
  } catch (error) {
    console.error("Failed to load disputes", error);
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
        disputes: []
      }
    };
  }
};
