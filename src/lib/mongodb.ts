import { MongoClient, Db, Collection } from "mongodb";

// グローバル変数でコネクションをキャッシュ（Vercelのコールドスタート対策）
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined;
}

let db: Db | null = null;

async function createClient(): Promise<MongoClient> {
  const client = new MongoClient(process.env.MONGODB_URI!, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 30000,
    maxPoolSize: 10,
    minPoolSize: 1,
    retryWrites: true,
    retryReads: true,
  });
  return client.connect();
}

export async function getDb(): Promise<Db> {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("MONGODB_URI / MONGODB_DB_NAME is not set");
  }

  // 既存の接続をチェック
  if (global._mongoClient && db) {
    try {
      // 接続が生きているか確認
      await global._mongoClient.db().admin().ping();
      return db;
    } catch {
      // 接続が切れている場合は再接続
      console.log("[MongoDB] Connection lost, reconnecting...");
      global._mongoClientPromise = undefined;
      global._mongoClient = undefined;
      db = null;
    }
  }

  // 新しい接続を作成
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = createClient();
  }

  try {
    global._mongoClient = await global._mongoClientPromise;
    db = global._mongoClient.db(process.env.MONGODB_DB_NAME);
    return db;
  } catch (error) {
    // 接続失敗時はキャッシュをクリア
    global._mongoClientPromise = undefined;
    global._mongoClient = undefined;
    db = null;
    throw error;
  }
}

export async function getCollection<T extends object = object>(
  name: string
): Promise<Collection<T>> {
  const database = await getDb();
  return database.collection<T>(name);
}
