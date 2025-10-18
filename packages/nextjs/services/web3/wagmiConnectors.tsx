import { embeddedWallet } from "@civic/auth-web3/wagmi";

/**
 * wagmi connectors for the wagmi context
 */
export const wagmiConnectors = () => {
  // Only create connectors on client-side to avoid SSR issues
  if (typeof window === "undefined") {
    return [];
  }
  // Return only the Civic embedded wallet connector
  return [embeddedWallet()];
};
