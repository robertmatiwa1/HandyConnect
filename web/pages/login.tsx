import { FormEvent, useState } from "react";
import Router from "next/router";
import type { GetServerSideProps } from "next";
import { Layout } from "../components/Layout";
import { credentialsHint, isAuthenticatedFromCookies } from "../lib/auth";

interface LoginProps {
  isAuthenticated: boolean;
}

export default function Login({ isAuthenticated }: LoginProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email");
    const password = formData.get("password");

    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    setIsSubmitting(false);

    if (response.ok) {
      Router.push("/disputes");
      return;
    }

    const data = await response.json();
    setError(data.message ?? "Failed to sign in");
  }

  return (
    <Layout isAuthenticated={isAuthenticated}>
      <section>
        <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>
          Sign in to HandyConnect Ops
        </h1>
        <p style={{ color: "#475569", maxWidth: "520px" }}>
          Use the secure credentials distributed to the operations team. Demo
          credentials: <strong>{credentialsHint.email}</strong> /{" "}
          <strong>{credentialsHint.password}</strong>.
        </p>
        <form onSubmit={handleSubmit} style={{ marginTop: "2rem" }}>
          <label>
            <span
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 600
              }}
            >
              Email
            </span>
            <input
              type="email"
              name="email"
              defaultValue={credentialsHint.email}
              required
            />
          </label>
          <label>
            <span
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 600
              }}
            >
              Password
            </span>
            <input
              type="password"
              name="password"
              defaultValue={credentialsHint.password}
              required
            />
          </label>
          {error && <div className="alert">{error}</div>}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in" : "Sign in"}
          </button>
        </form>
      </section>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps<LoginProps> = async ({ req }) => {
  const isAuthenticated = isAuthenticatedFromCookies(req.cookies);

  if (isAuthenticated) {
    return {
      redirect: {
        destination: "/disputes",
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
