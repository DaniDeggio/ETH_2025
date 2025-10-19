import "@rainbow-me/rainbowkit/styles.css";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import { LanguageProvider } from "../components/LanguageProvider";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";
import { NexusChatWidget } from "../components/NexusChatWidget";

export const metadata = getMetadata({
  title: "DebtShield",
  description: "Built with 🏗 Scaffold-ETH 2",
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning className={``}>
      <body>
        <LanguageProvider>
          <ThemeProvider enableSystem>
            {/* LanguageSwitcher moved to Footer */}
            <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>
            <NexusChatWidget />
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
