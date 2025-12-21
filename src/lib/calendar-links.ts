/**
 * Calendar link generators for various calendar services
 *
 * Supported services:
 * - Google Calendar (web URL)
 * - Outlook.com (Microsoft personal - web URL)
 * - Office 365 (Microsoft business - web URL)
 * - Yahoo Calendar (web URL)
 * - ICS file (universal download)
 */

export interface CalendarEvent {
  title: string;
  description: string;
  location: string;
  startDate: Date;
  endDate: Date;
  url?: string;
}

export interface CalendarLink {
  id: string;
  label: string;
  url: string;
  icon: string;
}

/**
 * Format date for Google/Yahoo Calendar (YYYYMMDDTHHmmssZ)
 */
function formatGoogleDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Format date for Outlook (ISO 8601)
 */
function formatOutlookDate(date: Date): string {
  return date.toISOString();
}

/**
 * Generate Google Calendar URL
 * https://calendar.google.com/calendar/render?action=TEMPLATE&...
 */
export function getGoogleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatGoogleDate(event.startDate)}/${formatGoogleDate(event.endDate)}`,
    details: event.description,
    location: event.location,
  });

  if (event.url) {
    params.set("sprop", `website:${event.url}`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate Outlook.com (personal) Calendar URL
 * https://outlook.live.com/calendar/0/deeplink/compose?...
 */
export function getOutlookUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    body: event.description,
    location: event.location,
    startdt: formatOutlookDate(event.startDate),
    enddt: formatOutlookDate(event.endDate),
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/**
 * Generate Office 365 Calendar URL
 * https://outlook.office.com/calendar/deeplink/compose?...
 */
export function getOffice365Url(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    body: event.description,
    location: event.location,
    startdt: formatOutlookDate(event.startDate),
    enddt: formatOutlookDate(event.endDate),
  });

  return `https://outlook.office.com/calendar/deeplink/compose?${params.toString()}`;
}

/**
 * Generate Yahoo Calendar URL
 * https://calendar.yahoo.com/?v=60&...
 */
export function getYahooCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    v: "60",
    title: event.title,
    desc: event.description,
    in_loc: event.location,
    st: formatGoogleDate(event.startDate),
    et: formatGoogleDate(event.endDate),
  });

  if (event.url) {
    params.set("url", event.url);
  }

  return `https://calendar.yahoo.com/?${params.toString()}`;
}

/**
 * Get all calendar links for an event
 */
export function getCalendarLinks(
  event: CalendarEvent,
  icsUrl: string,
): CalendarLink[] {
  return [
    {
      id: "google",
      label: "Google",
      url: getGoogleCalendarUrl(event),
      icon: "simple-icons:google",
    },
    {
      id: "outlook",
      label: "Outlook",
      url: getOutlookUrl(event),
      icon: "simple-icons:microsoftoutlook",
    },
    {
      id: "office365",
      label: "Office 365",
      url: getOffice365Url(event),
      icon: "lucide:calendar",
    },
    {
      id: "yahoo",
      label: "Yahoo",
      url: getYahooCalendarUrl(event),
      icon: "simple-icons:yahoo",
    },
    {
      id: "apple",
      label: "Apple / ICS",
      url: icsUrl,
      icon: "simple-icons:apple",
    },
  ];
}
