// M10 から Flex へのデータ移行スクリプト
import { MongoClient } from "mongodb";

// 旧クラスター (M10)
const OLD_URI = "mongodb+srv://hackjpn1204:WhclRCmmpnsDj7ez@cluster0.giuqi4s.mongodb.net/?retryWrites=true&w=majority";
const OLD_DB = "voice_agent";

// 新クラスター (Flex)
const NEW_URI = "mongodb+srv://hack:hack1204@cluster0.ay4hkb3.mongodb.net/?retryWrites=true&w=majority";
const NEW_DB = "voice_agent";

async function migrate() {
  console.log("=== MongoDB M10 → Flex 移行開始 ===\n");

  const oldClient = new MongoClient(OLD_URI);
  const newClient = new MongoClient(NEW_URI);

  try {
    // 接続
    console.log("旧クラスター (M10) に接続中...");
    await oldClient.connect();
    console.log("✓ 旧クラスター接続完了\n");

    console.log("新クラスター (Flex) に接続中...");
    await newClient.connect();
    console.log("✓ 新クラスター接続完了\n");

    const oldDb = oldClient.db(OLD_DB);
    const newDb = newClient.db(NEW_DB);

    // コレクション一覧を取得
    const collections = await oldDb.listCollections().toArray();
    console.log(`移行対象コレクション: ${collections.length}個\n`);

    let totalDocs = 0;

    for (const colInfo of collections) {
      const colName = colInfo.name;

      // システムコレクションはスキップ
      if (colName.startsWith("system.")) {
        console.log(`⏭ ${colName}: システムコレクション（スキップ）`);
        continue;
      }

      const oldCol = oldDb.collection(colName);
      const newCol = newDb.collection(colName);

      // ドキュメント数を取得
      const count = await oldCol.countDocuments();

      if (count === 0) {
        console.log(`⏭ ${colName}: 0件（スキップ）`);
        continue;
      }

      console.log(`📦 ${colName}: ${count}件を移行中...`);

      // バッチサイズで分割して移行（メモリ節約）
      const BATCH_SIZE = 500;
      let migrated = 0;

      const cursor = oldCol.find({});
      let batch: any[] = [];

      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        if (doc) {
          // _idを保持してコピー
          batch.push(doc);
        }

        if (batch.length >= BATCH_SIZE) {
          try {
            await newCol.insertMany(batch, { ordered: false });
          } catch (e: any) {
            // 重複キーエラーは無視（再実行時）
            if (e.code !== 11000) {
              console.error(`  エラー: ${e.message}`);
            }
          }
          migrated += batch.length;
          process.stdout.write(`  進捗: ${migrated}/${count}\r`);
          batch = [];
        }
      }

      // 残りのバッチを処理
      if (batch.length > 0) {
        try {
          await newCol.insertMany(batch, { ordered: false });
        } catch (e: any) {
          if (e.code !== 11000) {
            console.error(`  エラー: ${e.message}`);
          }
        }
        migrated += batch.length;
      }

      console.log(`✓ ${colName}: ${count}件完了`);
      totalDocs += count;
    }

    console.log(`\n=== 移行完了 ===`);
    console.log(`総ドキュメント数: ${totalDocs}件`);

    // 新クラスターの統計を確認
    console.log("\n=== 新クラスター (Flex) の状態 ===");
    const newStats = await newDb.stats();
    console.log(`データサイズ: ${(newStats.dataSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`ストレージサイズ: ${(newStats.storageSize / 1024 / 1024).toFixed(2)} MB`);

  } catch (error) {
    console.error("移行エラー:", error);
  } finally {
    await oldClient.close();
    await newClient.close();
  }
}

migrate();
