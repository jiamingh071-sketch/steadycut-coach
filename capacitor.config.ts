import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.steadycut.coach",
  appName: "SteadyCut",
  webDir: "dist/client",
  backgroundColor: "#101113",
  android: { allowMixedContent: false },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_steadycut",
      iconColor: "#E8942E"
    }
  }
};

export default config;
