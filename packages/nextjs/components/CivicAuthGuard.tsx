"use client";

import { ReactNode } from "react";
import { useUser } from "@civic/auth-web3/react";

interface CivicAuthGuardProps {
  children: ReactNode;
}

export const CivicAuthGuard = ({ children }: CivicAuthGuardProps) => {
  const { user, signIn, authStatus, isLoading } = useUser();

  const isAuthenticating =
    isLoading || authStatus === "authenticating" || authStatus === "signing_out";

  if (isAuthenticating) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-center text-lg">
        <span>Signing you in…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-center">
        <div className="max-w-md space-y-4">
          <h2 className="text-2xl font-semibold">Civic sign-in required</h2>
          <p className="text-base-content/80">
            Sign in with your Civic account to access this section of the app.
          </p>
          <button
            onClick={() => void signIn()}
            className="btn btn-primary px-6"
            type="button"
          >
            Sign in with Civic
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
