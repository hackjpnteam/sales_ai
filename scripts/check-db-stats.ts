// MongoDB データベース統計を確認するスクリプト
// 実行: npx ts-node scripts/check-db-stats.ts

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://hackjpn1204:WhclRCmmpnsDj7ez@cluster0.giuqi4s.mongodb.net/meeting-ai?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "voice_agent";

async function checkStats() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas\n");

    const db = client.db(DB_NAME);

    // データベース全体の統計
    const dbStats = await db.stats();
    console.log("=== データベース統計 ===");
    console.log(`データサイズ: ${(dbStats.dataSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`ストレージサイズ: ${(dbStats.storageSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`インデックスサイズ: ${(dbStats.indexSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`コレクション数: ${dbStats.collections}`);
    console.log(`ドキュメント総数: ${dbStats.objects}`);

    console.log("\n=== コレクション別統計 ===");

    // 主要コレクションの統計
    const collections = ["documents", "custom_knowledge", "agents", "companies", "chat_logs", "users"];

    for (const colName of collections) {
      try {
        const col = db.collection(colName);
        const count = await col.countDocuments();
        const stats = await col.aggregate([
          { $group: { _id: null, count: { $sum: 1 } } }
        ]).toArray();

        // コレクションのサイズを取得
        const colStats = await db.command({ collStats: colName });
        const sizeMB = (colStats.size / 1024 / 1024).toFixed(2);
        const storageMB = (colStats.storageSize / 1024 / 1024).toFixed(2);

        console.log(`\n${colName}:`);
        console.log(`  ドキュメント数: ${count}`);
        console.log(`  データサイズ: ${sizeMB} MB`);
        console.log(`  ストレージサイズ: ${storageMB} MB`);
      } catch (e) {
        console.log(`\n${colName}: コレクションなし or エラー`);
      }
    }

    // Free Tier の上限
    console.log("\n=== Free Tier (M0) 上限 ===");
    console.log("ストレージ上限: 512 MB");
    const usagePercent = ((dbStats.storageSize / 1024 / 1024) / 512 * 100).toFixed(1);
    console.log(`現在の使用率: ${usagePercent}%`);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

checkStats();
