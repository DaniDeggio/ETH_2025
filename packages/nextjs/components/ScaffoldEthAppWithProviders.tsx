// This file is a Server Component boundary that embeds client-only providers.
// Do NOT add "use client" here.
import React, { Suspense } from "react";
import { CivicAuthProvider } from "@civic/auth-web3/nextjs";
import { sepolia } from "viem/chains";
import { ClientProviders } from "~~/components/ClientProviders";

export function ScaffoldEthAppWithProviders({ children }: { children: React.ReactNode }) {
  // Server boundary; client providers handle Wagmi and CivicAuth inside the client tree.
  return (
    <CivicAuthProvider chains={[sepolia]} initialChain={sepolia}>
      <Suspense fallback={<div className="p-4 text-sm opacity-70">Loading app…</div>}>
        <ClientProviders>{children}</ClientProviders>
      </Suspense>
    </CivicAuthProvider>
  );
}
