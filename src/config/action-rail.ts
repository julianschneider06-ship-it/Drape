// Vertical action rail at the right edge of the For You feed (display/interaction only).
// The outfit canvas is narrower by ACTION_RAIL_WIDTH, so no piece, sale label or tap area can reach under the rail.
export const ACTION_RAIL_WIDTH = 48;   // px reserved on the right of every feed outfit card; also the minimum tap size of a rail icon (>= 44)
// Heart colours: white-filled with a thin grey outline and soft shadow at rest (stands out on the white page), red-filled when all pieces are liked.
export const RAIL_HEART = { restFill: "#ffffff", restStroke: "#9ca3af", restShadow: "drop-shadow(0 1px 2px rgba(0,0,0,0.18))", likedFill: "#e5252a", likedStroke: "#e5252a" };
