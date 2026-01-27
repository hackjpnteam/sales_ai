// hackjpnのagent全データを確認
import { MongoClient } from "mongodb";

const MONGODB_URI = "mongodb+srv://hack:hack1204@cluster0.ay4hkb3.mongodb.net/?retryWrites=true&w=majority";
const DB_NAME = "voice_agent";

async function findAddress() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // hackjpnのcompanyIdを取得
    const companiesCol = db.collection("companies");
    const hackjpn = await companiesCol.findOne({ name: { $regex: /hackjpn/i } });

    if (hackjpn) {
      const agentsCol = db.collection("agents");
      const agent = await agentsCol.findOne({ companyId: hackjpn.companyId });

      console.log("=== hackjpn Agent 全データ ===\n");
      console.log("systemPrompt:", agent?.systemPrompt || "(なし)");
      console.log("\nknowledge:", agent?.knowledge || "(なし)");
      console.log("\nstyle:", agent?.style || "(なし)");
      console.log("\nguardrails:", agent?.guardrails || "(なし)");
      console.log("\nngResponses:", agent?.ngResponses || "(なし)");

      console.log("\n=== companyInfo ===");
      console.log(JSON.stringify(agent?.companyInfo, null, 2));

      // 全文検索
      const searchText = "渋谷区";
      const agentJson = JSON.stringify(agent);
      if (agentJson.includes(searchText)) {
        console.log(`\n「${searchText}」がagentデータに含まれています`);
        // どこに含まれているか特定
        for (const [key, value] of Object.entries(agent || {})) {
          if (JSON.stringify(value).includes(searchText)) {
            console.log(`→ フィールド: ${key}`);
          }
        }
      } else {
        console.log(`\n「${searchText}」はagentデータに含まれていません`);
      }

      // documentsも確認
      const docsCol = db.collection("documents");
      const allDocs = await docsCol.find({ companyId: hackjpn.companyId }).toArray();
      console.log(`\n=== documents: ${allDocs.length}件 ===`);

      for (const doc of allDocs) {
        if (doc.chunk?.includes("渋谷") || doc.chunk?.includes("宇田川")) {
          console.log(`\n見つかった！ URL: ${doc.url}`);
          console.log(`Title: ${doc.title}`);
          console.log(`Chunk: ${doc.chunk}`);
        }
      }
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

findAddress();
