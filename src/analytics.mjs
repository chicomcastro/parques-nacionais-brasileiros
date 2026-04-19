import * as amplitude from "@amplitude/analytics-browser";

const API_KEY = "d026845d083eec99454c10e7642072c0";

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
