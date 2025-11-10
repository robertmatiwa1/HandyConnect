import type { GetServerSideProps } from "next";
import { Layout } from "../components/Layout";
import { isAuthenticatedFromCookies } from "../lib/auth";

interface RefundsProps {
  isAuthenticated: boolean;
}

const refunds = [
  {
    id: "RFND-8781",
    customer: "Morgan Patel",
    job: "Deep Cleaning",
    amount: "$210.00",
    status: "Pending approval"
  },
  {
    id: "RFND-8782",
    customer: "Grace Kim",
    job: "Plumbing Repair",
    amount: "$320.00",
    status: "Awaiting documents"
  }
];

export default function Refunds({ isAuthenticated }: RefundsProps) {
  return (
    <Layout isAuthenticated={isAuthenticated}>
      <section>
        <h1 style={{ fontSize: "2.25rem", marginBottom: "1rem" }}>
          Refund Management
        </h1>
        <p style={{ color: "#475569", maxWidth: "620px" }}>
          Analyze refund submissions, request supporting evidence, and issue
          decisions aligned with HandyConnect customer policies.
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
                <th style={{ paddingBottom: "0.75rem" }}>Request</th>
                <th>Customer</th>
                <th>Service</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((refund) => (
                <tr key={refund.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "0.75rem 0" }}>{refund.id}</td>
                  <td>{refund.customer}</td>
                  <td>{refund.job}</td>
                  <td>{refund.amount}</td>
                  <td>{refund.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps<RefundsProps> = async ({
  req
}) => {
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
