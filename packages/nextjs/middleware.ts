import { authMiddleware } from "@civic/auth-web3/nextjs/middleware";

export default authMiddleware();

export const config = {
  // Secure app routes; exclude Next internals, static assets, and Civic auth callbacks
  matcher: [
    "/", // ensure root is covered

    // Match everything except:
    // - Next internals and static/image assets
    // - common public files
    // - Civic auth API routes (login/callback/etc.) to prevent redirect loops
    "/((?!api/auth/|_next|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:jpg|jpeg|png|gif|svg|webp|avif)).*)",
  ],
};
