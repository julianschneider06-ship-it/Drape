import { test } from "node:test";
import assert from "node:assert/strict";
import { navTabs, navVisible, TAB_LABELS } from "../src/lib/nav-tabs";

test("tab order with search on", () => assert.deepEqual(navTabs(true), ["foryou", "search", "likes", "profile"]));
test("search off leaves For You, Wishlist and Profile", () => assert.deepEqual(navTabs(false), ["foryou", "likes", "profile"]));
test("labels", () => assert.deepEqual(navTabs(true).map((t) => TAB_LABELS[t]), ["For You", "Search", "Wishlist", "Profile"]));
test("bar hidden until ready and during welcome/tutorial", () => {
  assert.equal(navVisible(false, true), false);
  assert.equal(navVisible(true, false), false);
  assert.equal(navVisible(true, true), true);
});
