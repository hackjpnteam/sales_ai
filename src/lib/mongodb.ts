import { MongoClient, Db, Collection } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;

  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("MONGODB_URI / MONGODB_DB_NAME is not set");
  }

  client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    retryWrites: true,
    retryReads: true,
  });
  await client.connect();
  db = client.db(process.env.MONGODB_DB_NAME);

  return db;
}

export async function getCollection<T extends object = object>(
  name: string
): Promise<Collection<T>> {
  const database = await getDb();
  return database.collection<T>(name);
}
