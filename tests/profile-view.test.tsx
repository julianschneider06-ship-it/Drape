import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import ProfileView from "../src/components/ProfileView";
import MotionRoot from "../src/components/MotionRoot";

// Server render = no window, no localStorage: the Profile page must still render with the defaults.
test("Profile page renders without storage", () => {
  const html = renderToString(createElement(MotionRoot, null, createElement(ProfileView)));
  assert.match(html, /Profile/); assert.match(html, /Email address/); assert.match(html, /Account coming later/); assert.match(html, /aria-disabled="true"/);
  assert.match(html, /Sale marker/); assert.match(html, /Your shops/); assert.match(html, /No shops changed yet/);
  assert.doesNotMatch(html, /awin|affiliate/i);
});
