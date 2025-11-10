import type { GetServerSideProps } from "next";

import { Layout } from "../components/Layout";
import { fetchFromBackend } from "../lib/backend";
import { getAuthTokenFromCookies, isAuthenticatedFromCookies } from "../lib/auth";
import { formatCurrency } from "../lib/format";
import { OpsRefund } from "../lib/types";

interface RefundsProps {
  isAuthenticated: boolean;
  refunds: OpsRefund[];
}

const refundStatusCopy: Record<string, string> = {
  PENDING_REVIEW: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected"
};

export default function Refunds({ isAuthenticated, refunds }: RefundsProps) {
  return (
    <Layout isAuthenticated={isAuthenticated}>
      <section>
        <h1 style={{ fontSize: "2.25rem", marginBottom: "1rem" }}>Refund Management</h1>
        <p style={{ color: "#475569", maxWidth: "620px" }}>
          Analyze refund submissions, request supporting evidence, and issue decisions while keeping the customer
          experience top of mind.
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
                <th style={{ paddingBottom: "0.75rem" }}>Refund</th>
                <th>Customer</th>
                <th>Provider</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Requested</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((refund) => (
                <tr key={refund.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "0.75rem 0" }}>{refund.id}</td>
                  <td>{refund.customerName}</td>
                  <td>{refund.providerName}</td>
                  <td>{formatCurrency(refund.amountCents / 100)}</td>
                  <td>{refundStatusCopy[refund.status] ?? refund.status}</td>
                  <td>{new Date(refund.requestedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {refunds.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "#64748b" }}>
                    No refunds awaiting action.
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

export const getServerSideProps: GetServerSideProps<RefundsProps> = async ({ req }) => {
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
    const data = await fetchFromBackend<{ refunds: OpsRefund[] }>("/ops/refunds", token);
    return {
      props: {
        isAuthenticated: true,
        refunds: data.refunds
      }
    };
  } catch (error) {
    console.error("Failed to load refunds", error);
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
        refunds: []
      }
    };
  }
};
