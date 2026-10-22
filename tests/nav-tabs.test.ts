import { test } from "node:test";
import assert from "node:assert/strict";
import { navTabs, navVisible, TAB_LABELS } from "../src/lib/nav-tabs";

test("tab order with search on", () => assert.deepEqual(navTabs(true), ["foryou", "search", "likes"]));
test("search off leaves For You and Likes", () => assert.deepEqual(navTabs(false), ["foryou", "likes"]));
test("labels", () => assert.deepEqual(navTabs(true).map((t) => TAB_LABELS[t]), ["For You", "Search", "Wishlist"]));
test("bar hidden until ready and during welcome/tutorial", () => {
  assert.equal(navVisible(false, true), false);
  assert.equal(navVisible(true, false), false);
  assert.equal(navVisible(true, true), true);
});
