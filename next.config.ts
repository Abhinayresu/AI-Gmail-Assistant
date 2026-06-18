import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/api/auth/save-token",
        destination: "http://127.0.0.1:8000/auth/google",
      },
      {
        source: "/api/sync/repair-summaries",
        destination: "http://127.0.0.1:8000/sync/repair-summaries",
      },
      {
        source: "/api/sync",
        destination: "http://127.0.0.1:8000/sync",
      },
      {
        source: "/api/sync/send",
        destination: "http://127.0.0.1:8000/reply/send",
      },
      {
        source: "/api/reply",
        destination: "http://127.0.0.1:8000/reply",
      },
      {
        source: "/api/chat",
        destination: "http://127.0.0.1:8000/chat",
      },
      {
        source: "/api/compose",
        destination: "http://127.0.0.1:8000/compose",
      },
      {
        source: "/api/compose/send",
        destination: "http://127.0.0.1:8000/compose/send",
      },
      {
        source: "/api/newsletters/cluster",
        destination: "http://127.0.0.1:8000/newsletters/deduplicate",
      },
    ];
  },
};

export default nextConfig;

