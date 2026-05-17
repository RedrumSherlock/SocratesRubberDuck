export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Dynamic imports to avoid edge runtime issues
    const { _scheduleProfileUpdate } = await import("./lib/profile-updater");
    _scheduleProfileUpdate();
  }
}
