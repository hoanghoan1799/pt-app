import { describe, expect, it } from "vitest";

import { DISMISS_DAYS } from "@/features/pwa/constants";

import { detectInstallPlatform, isDismissed } from "../detect-install-platform";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1",
  ipadOs:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36",
  zaloAndroid:
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36 Zalo/24.05.01",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0.0.37.108;FBBV/569293617;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBLC/vi_VN]",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 Instagram 330.0.0.40.97 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 8; shiba; shiba; en_US; 560339221)",
  tiktokAndroid:
    "Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 trill_340000 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/34.0.0 ByteLocale/vi-VN BytedanceWebview/d8a21c6",
  tiktokIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_34.0.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/vi Region/VN",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 12; Redmi Note 11 Build/SKQ1.211103.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.113 Mobile Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

const detect = (userAgent: string, maxTouchPoints = 0, isStandalone = false) =>
  detectInstallPlatform({ userAgent, maxTouchPoints, isStandalone });

describe("detectInstallPlatform", () => {
  it("returns ios for iPhone Safari", () => {
    expect(detect(UA.iphoneSafari, 5)).toBe("ios");
  });

  it("returns ios for iPhone Chrome (CriOS)", () => {
    expect(detect(UA.iphoneChrome, 5)).toBe("ios");
  });

  it("returns ios for iPadOS 13+ that reports a desktop Safari UA with touch", () => {
    expect(detect(UA.ipadOs, 5)).toBe("ios");
  });

  it("does not treat a real Mac (no touch points) as ios", () => {
    expect(detect(UA.macSafari, 0)).toBe("other");
  });

  it("returns android for Android Chrome", () => {
    expect(detect(UA.androidChrome, 5)).toBe("android");
  });

  it("returns in-app for the Zalo browser", () => {
    expect(detect(UA.zaloAndroid, 5)).toBe("in-app");
  });

  it("returns in-app for the Facebook app on iOS (FBAN) before ios", () => {
    expect(detect(UA.facebookIos, 5)).toBe("in-app");
  });

  it("returns in-app for the Instagram browser", () => {
    expect(detect(UA.instagramAndroid, 5)).toBe("in-app");
  });

  it("returns in-app for the TikTok browser on Android and iOS", () => {
    expect(detect(UA.tiktokAndroid, 5)).toBe("in-app");
    expect(detect(UA.tiktokIos, 5)).toBe("in-app");
  });

  it("returns in-app for a generic Android WebView (; wv)", () => {
    expect(detect(UA.androidWebView, 5)).toBe("in-app");
  });

  it("returns other for desktop Chrome", () => {
    expect(detect(UA.windowsChrome, 0)).toBe("other");
  });

  it("returns installed in standalone display mode, whatever the UA", () => {
    expect(detect(UA.iphoneSafari, 5, true)).toBe("installed");
    expect(detect(UA.androidChrome, 5, true)).toBe("installed");
    expect(detect(UA.zaloAndroid, 5, true)).toBe("installed");
  });
});

describe("isDismissed", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 10, 2);

  it("is false when never dismissed", () => {
    expect(isDismissed(null, now)).toBe(false);
  });

  it("is true right after dismissing", () => {
    expect(isDismissed(now, now)).toBe(true);
  });

  it("is true one millisecond before the window ends", () => {
    expect(isDismissed(now - DISMISS_DAYS * DAY + 1, now)).toBe(true);
  });

  it("is false once 14 days have passed", () => {
    expect(DISMISS_DAYS).toBe(14);
    expect(isDismissed(now - 14 * DAY, now)).toBe(false);
    expect(isDismissed(now - 30 * DAY, now)).toBe(false);
  });

  it("ignores a corrupt stored value", () => {
    expect(isDismissed(Number.NaN, now)).toBe(false);
  });
});
