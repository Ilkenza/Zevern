import type { NextConfig } from "next";

/**
 * The server keeps the user's clock, not the datacentre's.
 *
 * Almost every date in Zevern is a wall clock and carries no zone at all, so it
 * reads back the same wherever it is opened. "Today" is the exception: the tasks
 * due today, the overdue counts and the revenue month are all decided on the
 * server, and a host running in UTC answers "what day is it" with yesterday's date
 * for the first two hours of every Belgrade morning.
 *
 * Set `APP_TIMEZONE` to move it. The default is simply where the app is used.
 */
process.env.TZ = process.env.APP_TIMEZONE || "Europe/Belgrade";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
