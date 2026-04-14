import * as amplitude from "@amplitude/analytics-browser";

const API_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY || "";

let initialized = false;

export function initAnalytics() {
  if (!API_KEY || initialized) return;
  amplitude.init(API_KEY, { defaultTracking: { pageViews: true, sessions: true } });
  initialized = true;
}

export function track(event, props) {
  if (!initialized) return;
  amplitude.track(event, props);
}
