import type { NextConfig } from "next";

// Allow all 192.168.x.x LAN IPs for dev access (e.g., mobile testing)
const lanOrigins = Array.from({ length: 255 }, (_, i) => `192.168.2.${i + 1}`);

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",")
    : lanOrigins,
};

export default nextConfig;
