import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.eventframe.mobile",
  appName: "EventFrame",
  webDir: "dist",
  backgroundColor: "#f4efe7",
  server: {
    hostname: "localhost",
    androidScheme: "https"
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile"
  }
};

export default config;
