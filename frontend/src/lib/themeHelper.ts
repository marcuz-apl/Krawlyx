/**
 * Helper utilities to calculate sunrise and sunset times based on the browser's timezone
 * and determine if the current local time is day or night.
 */

export interface TimezoneThemeInfo {
  timezone: string;
  latitude: number;
  longitude: number;
  sunriseHour: number;
  sunsetHour: number;
  calculatedTheme: "light" | "dark";
}

export function getCoordinatesForTimezone(tz: string): { lat: number; lng: number } {
  const defaults: Record<string, { lat: number; lng: number }> = {
    // Europe
    "Europe/London": { lat: 51.5074, lng: -0.1278 },
    "Europe/Paris": { lat: 48.8566, lng: 2.3522 },
    "Europe/Berlin": { lat: 52.5200, lng: 13.4050 },
    "Europe/Rome": { lat: 41.9028, lng: 12.4964 },
    "Europe/Madrid": { lat: 40.4168, lng: -3.7038 },
    "Europe/Athens": { lat: 37.9838, lng: 23.7275 },
    "Europe/Moscow": { lat: 55.7558, lng: 37.6173 },
    "Europe/Amsterdam": { lat: 52.3676, lng: 4.9041 },
    "Europe/Brussels": { lat: 50.8503, lng: 4.3517 },
    "Europe/Vienna": { lat: 48.2082, lng: 16.3738 },
    "Europe/Warsaw": { lat: 52.2297, lng: 21.0122 },
    "Europe/Dublin": { lat: 53.3498, lng: -6.2603 },
    "Europe/Oslo": { lat: 59.9139, lng: 10.7522 },
    "Europe/Stockholm": { lat: 59.3293, lng: 18.0686 },
    "Europe/Helsinki": { lat: 60.1699, lng: 24.9384 },
    "Europe/Copenhagen": { lat: 55.6761, lng: 12.5683 },
    "Europe/Zurich": { lat: 47.3769, lng: 8.5417 },
    "Europe/Istanbul": { lat: 41.0082, lng: 28.9784 },
    
    // North America
    "America/New_York": { lat: 40.7128, lng: -74.0060 },
    "America/Chicago": { lat: 41.8781, lng: -87.6298 },
    "America/Denver": { lat: 39.7392, lng: -104.9903 },
    "America/Los_Angeles": { lat: 34.0522, lng: -118.2437 },
    "America/Anchorage": { lat: 61.2181, lng: -149.9003 },
    "America/Honolulu": { lat: 21.3069, lng: -157.8583 },
    "America/Phoenix": { lat: 33.4484, lng: -112.0740 },
    "America/Vancouver": { lat: 49.2827, lng: -123.1207 },
    "America/Toronto": { lat: 43.6532, lng: -79.3832 },
    "America/Montreal": { lat: 45.5017, lng: -73.5673 },
    "America/Edmonton": { lat: 53.5461, lng: -113.4938 },
    "America/Mexico_City": { lat: 19.4326, lng: -99.1332 },
    "America/Bogota": { lat: 4.7110, lng: -74.0721 },
    "America/Lima": { lat: -12.0464, lng: -77.0428 },
    "America/Caracas": { lat: 10.4806, lng: -66.9036 },
    
    // Asia
    "Asia/Tokyo": { lat: 35.6762, lng: 139.6503 },
    "Asia/Seoul": { lat: 37.5665, lng: 126.9780 },
    "Asia/Shanghai": { lat: 31.2304, lng: 121.4737 },
    "Asia/Hong_Kong": { lat: 22.3193, lng: 114.1694 },
    "Asia/Taipei": { lat: 25.0330, lng: 121.5654 },
    "Asia/Singapore": { lat: 1.3521, lng: 103.8198 },
    "Asia/Bangkok": { lat: 13.7563, lng: 100.5018 },
    "Asia/Kolkata": { lat: 22.5726, lng: 88.3639 },
    "Asia/Dubai": { lat: 25.2048, lng: 55.2708 },
    "Asia/Riyadh": { lat: 24.7136, lng: 46.6753 },
    
    // Australia
    "Australia/Sydney": { lat: -33.8688, lng: 151.2093 },
    "Australia/Melbourne": { lat: -37.8136, lng: 144.9631 },
    "Australia/Perth": { lat: -31.9505, lng: 115.8605 },
    "Pacific/Auckland": { lat: -36.8485, lng: 174.7633 },
  };

  if (defaults[tz]) {
    return defaults[tz];
  }

  // Fallback heuristic calculations based on time zone properties
  const offsetMinutes = new Date().getTimezoneOffset();
  const lng = -offsetMinutes / 4;
  
  let lat = 35;
  const lowerTz = tz.toLowerCase();
  if (
    lowerTz.startsWith("australia/") || 
    lowerTz.startsWith("pacific/") || 
    lowerTz.startsWith("antarctica/") ||
    lowerTz.includes("south") || 
    lowerTz.includes("argentina") || 
    lowerTz.includes("brazil") || 
    lowerTz.includes("chile") ||
    lowerTz.includes("sydney")
  ) {
    lat = -30;
  } else if (lowerTz.startsWith("africa/")) {
    lat = 5;
  }
  
  return { lat, lng };
}

export function getSunriseSunsetTimes(lat: number, lng: number, date = new Date()): { sunrise: number; sunset: number } {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  const latRad = (lat * Math.PI) / 180;
  const declination = 0.409 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365);
  const val = -Math.tan(latRad) * Math.tan(declination);
  
  let dayLength = 12;
  if (val >= -1 && val <= 1) {
    dayLength = (24 / Math.PI) * Math.acos(val);
  } else if (val < -1) {
    dayLength = 24;
  } else {
    dayLength = 0;
  }

  const timezoneOffsetHours = -date.getTimezoneOffset() / 60;
  const standardMeridian = 15 * timezoneOffsetHours;
  const solarNoonLocal = 12 - (lng - standardMeridian) / 15;

  const sunrise = solarNoonLocal - dayLength / 2;
  const sunset = solarNoonLocal + dayLength / 2;

  return { sunrise, sunset };
}

export function getTimezoneThemeInfo(): TimezoneThemeInfo {
  let tz = "UTC";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    tz = "America/New_York";
  }

  const { lat, lng } = getCoordinatesForTimezone(tz);
  const now = new Date();
  const { sunrise, sunset } = getSunriseSunsetTimes(lat, lng, now);
  const currentHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;

  const calculatedTheme = (currentHour >= sunrise && currentHour < sunset) ? "light" : "dark";

  return {
    timezone: tz,
    latitude: lat,
    longitude: lng,
    sunriseHour: sunrise,
    sunsetHour: sunset,
    calculatedTheme,
  };
}

export function getCalculatedTheme(): "light" | "dark" {
  return getTimezoneThemeInfo().calculatedTheme;
}
