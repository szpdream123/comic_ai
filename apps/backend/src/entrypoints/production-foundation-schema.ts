import { createDevDb } from "../modules/shared/db/dev-db.ts";

const db = await createDevDb();

await db.close();
