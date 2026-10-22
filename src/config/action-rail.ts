// Vertical action rail at the right edge of the For You feed (display/interaction only).
// The outfit canvas is narrower by ACTION_RAIL_WIDTH, so no piece, sale label or tap area can reach under the rail.
export const ACTION_RAIL_WIDTH = 48;   // px reserved on the right of every feed outfit card; also the minimum tap size of a rail icon (>= 44)
// Heart (all values here): white fill without outline and a very soft drop shadow at rest (lifts off the white page), red fill when all pieces are liked.
export const RAIL_HEART = { size: 30, restFill: "#ffffff", restStroke: "none", restShadow: "drop-shadow(0 1px 3px rgba(0,0,0,0.16))", likedFill: "#e5252a", likedStroke: "none" };
