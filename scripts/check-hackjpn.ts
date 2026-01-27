// hackjpn関連のデータを全て確認
import { MongoClient } from "mongodb";

const MONGODB_URI = "mongodb+srv://hack:hack1204@cluster0.ay4hkb3.mongodb.net/?retryWrites=true&w=majority";
const DB_NAME = "voice_agent";

async function check() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // hackjpnを含む全会社
    const companiesCol = db.collection("companies");
    const companies = await companiesCol.find({ name: { $regex: /hackjpn/i } }).toArray();
    console.log("=== hackjpnを含む会社 ===");
    for (const c of companies) {
      console.log(`- ${c.name} (${c.companyId}) rootUrl: ${c.rootUrl}`);
    }

    // 各会社のdocuments数を確認
    const docsCol = db.collection("documents");
    const agentsCol = db.collection("agents");

    console.log("\n=== 各会社のデータ量 ===");
    for (const c of companies) {
      const docCount = await docsCol.countDocuments({ companyId: c.companyId });
      const agent = await agentsCol.findOne({ companyId: c.companyId });
      console.log(`\n${c.name}:`);
      console.log(`  documents: ${docCount}件`);
      console.log(`  rootUrl: ${c.rootUrl}`);
      console.log(`  agentId: ${agent?.agentId}`);
      console.log(`  companyInfo: ${agent?.companyInfo ? '有り' : '無し'}`);

      // companyInfoに住所があるか
      if (agent?.companyInfo?.address) {
        console.log(`  address: ${agent.companyInfo.address}`);
      }
    }

    // 渋谷区を含むデータを全コレクションで検索
    console.log("\n=== 渋谷区を含むデータ（全コレクション）===");
    const collections = await db.listCollections().toArray();
    for (const colInfo of collections) {
      if (colInfo.name.startsWith("system.")) continue;
      const col = db.collection(colInfo.name);

      // テキストフィールドで検索
      try {
        const results = await col.find({
          $or: [
            { chunk: { $regex: "渋谷区" } },
            { content: { $regex: "渋谷区" } },
            { address: { $regex: "渋谷区" } },
            { "companyInfo.address": { $regex: "渋谷区" } }
          ]
        }).limit(5).toArray();

        if (results.length > 0) {
          console.log(`\n${colInfo.name}: ${results.length}件`);
          results.forEach(r => {
            console.log(`  - ${r.companyId || r._id}`);
            if (r.chunk) console.log(`    chunk: ${r.chunk.substring(0, 100)}...`);
            if (r.content) console.log(`    content: ${r.content.substring(0, 100)}...`);
            if (r.companyInfo?.address) console.log(`    address: ${r.companyInfo.address}`);
          });
        }
      } catch {
        // ignore
      }
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

check();
