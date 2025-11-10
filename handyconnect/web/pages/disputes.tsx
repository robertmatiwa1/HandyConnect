import type { GetServerSideProps } from "next";
import { Layout } from "../components/Layout";
import { isAuthenticatedFromCookies } from "../lib/auth";

interface DisputesProps {
  isAuthenticated: boolean;
}

const disputes = [
  {
    id: "DSP-2042",
    customer: "Jamie Lee",
    amount: "$180.00",
    status: "Awaiting merchant evidence",
    submittedAt: "2023-10-01"
  },
  {
    id: "DSP-2043",
    customer: "Alex Morgan",
    amount: "$95.00",
    status: "Chargeback filed",
    submittedAt: "2023-09-28"
  }
];

export default function Disputes({ isAuthenticated }: DisputesProps) {
  return (
    <Layout isAuthenticated={isAuthenticated}>
      <section>
        <h1 style={{ fontSize: "2.25rem", marginBottom: "1rem" }}>
          Dispute Resolution
        </h1>
        <p style={{ color: "#475569", maxWidth: "620px" }}>
          Review open customer disputes, gather supporting documentation, and
          coordinate with payment processors to minimize financial exposure.
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
                <th>Amount</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {disputes.map((dispute) => (
                <tr key={dispute.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "0.75rem 0" }}>{dispute.id}</td>
                  <td>{dispute.customer}</td>
                  <td>{dispute.amount}</td>
                  <td>{dispute.status}</td>
                  <td>{dispute.submittedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps<DisputesProps> = async ({
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
