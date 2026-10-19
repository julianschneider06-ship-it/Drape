// Dev helper: npx tsx scripts/rpc.ts <fn> '<json args>'
import { rpc } from "../src/ingest/gateway";
rpc(process.argv[2], process.argv[3] ? JSON.parse(process.argv[3]) : {}).then((r) => console.log(JSON.stringify(r)));
