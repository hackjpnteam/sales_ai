import { MongoClient, Db, Collection } from "mongodb";

// グローバル変数でコネクションをキャッシュ（Vercelのコールドスタート対策）
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;

  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("MONGODB_URI / MONGODB_DB_NAME is not set");
  }

  // グローバルキャッシュを使用
  if (!global._mongoClientPromise) {
    client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,  // 30秒→5秒に短縮
      connectTimeoutMS: 5000,          // 30秒→5秒に短縮
      socketTimeoutMS: 10000,          // 45秒→10秒に短縮
      maxPoolSize: 10,
      retryWrites: true,
      retryReads: true,
    });
    global._mongoClientPromise = client.connect();
  }

  client = await global._mongoClientPromise;
  db = client.db(process.env.MONGODB_DB_NAME);

  return db;
}

export async function getCollection<T extends object = object>(
  name: string
): Promise<Collection<T>> {
  const database = await getDb();
  return database.collection<T>(name);
}
