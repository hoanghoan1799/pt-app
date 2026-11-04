import { describe, expect, it } from "vitest";

import {
  getPushOptInState,
  type PushOptInInput,
  urlBase64ToUint8Array,
} from "../push-support";

const base: PushOptInInput = {
  supported: true,
  permission: "default",
  standalone: false,
  isIos: false,
  dismissed: false,
  subscribed: false,
  hasVapidKey: true,
};

describe("getPushOptInState", () => {
  it("shows the card on a supported browser that has not decided", () => {
    expect(getPushOptInState(base)).toBe("show");
  });

  it("shows the card when permission is granted but nothing is subscribed", () => {
    expect(getPushOptInState({ ...base, permission: "granted" })).toBe("show");
  });

  it("hides without a VAPID key, even on iOS", () => {
    expect(getPushOptInState({ ...base, hasVapidKey: false })).toBe("hidden");
    expect(
      getPushOptInState({ ...base, hasVapidKey: false, isIos: true }),
    ).toBe("hidden");
  });

  it("hides once dismissed, including the denied and iOS variants", () => {
    expect(getPushOptInState({ ...base, dismissed: true })).toBe("hidden");
    expect(
      getPushOptInState({ ...base, dismissed: true, permission: "denied" }),
    ).toBe("hidden");
    expect(getPushOptInState({ ...base, dismissed: true, isIos: true })).toBe(
      "hidden",
    );
  });

  it("hides when already subscribed", () => {
    expect(
      getPushOptInState({ ...base, subscribed: true, permission: "granted" }),
    ).toBe("hidden");
  });

  it("asks iOS users in a browser tab to install the app first", () => {
    expect(getPushOptInState({ ...base, isIos: true, supported: false })).toBe(
      "ios-install-hint",
    );
  });

  it("shows the normal card in the installed iOS app", () => {
    expect(getPushOptInState({ ...base, isIos: true, standalone: true })).toBe(
      "show",
    );
  });

  it("hides in the installed iOS app when push is unsupported (iOS < 16.4)", () => {
    expect(
      getPushOptInState({
        ...base,
        isIos: true,
        standalone: true,
        supported: false,
        permission: "unsupported",
      }),
    ).toBe("hidden");
  });

  it("hides on unsupported non-iOS browsers", () => {
    expect(
      getPushOptInState({
        ...base,
        supported: false,
        permission: "unsupported",
      }),
    ).toBe("hidden");
  });

  it("explains how to re-enable when permission is denied", () => {
    expect(getPushOptInState({ ...base, permission: "denied" })).toBe("denied");
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url without padding", () => {
    // "hello" is aGVsbG8 unpadded.
    expect(Array.from(urlBase64ToUint8Array("aGVsbG8"))).toEqual([
      104, 101, 108, 108, 111,
    ]);
  });

  it("maps the url-safe alphabet back to + and /", () => {
    // "-_-_" is "+/+/" in plain base64.
    expect(Array.from(urlBase64ToUint8Array("-_-_"))).toEqual([
      0xfb, 0xff, 0xbf,
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(urlBase64ToUint8Array("")).toHaveLength(0);
  });
});
