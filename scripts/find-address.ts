// 住所を含むデータを検索
import { MongoClient } from "mongodb";

const MONGODB_URI = "mongodb+srv://hack:hack1204@cluster0.ay4hkb3.mongodb.net/?retryWrites=true&w=majority";
const DB_NAME = "voice_agent";

async function findAddress() {
  const client = new MongoClient(MONGODB_URI);
  const searchText = "宇田川町";

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    console.log(`「${searchText}」を含むデータを検索中...\n`);

    // hackjpnのcompanyIdを取得
    const companiesCol = db.collection("companies");
    const hackjpn = await companiesCol.findOne({ name: { $regex: /hackjpn/i } });
    console.log("hackjpn company:", hackjpn?.companyId, hackjpn?.name);

    if (hackjpn) {
      // 1. documentsコレクションを検索
      const docsCol = db.collection("documents");
      const docs = await docsCol.find({
        companyId: hackjpn.companyId,
        $or: [
          { chunk: { $regex: searchText } },
          { title: { $regex: searchText } }
        ]
      }).toArray();
      console.log(`\n=== documents (${docs.length}件) ===`);
      docs.forEach(d => {
        console.log(`- URL: ${d.url}`);
        console.log(`  Title: ${d.title}`);
        console.log(`  Chunk: ${d.chunk?.substring(0, 200)}...`);
      });

      // 2. custom_knowledgeを検索
      const knowledgeCol = db.collection("custom_knowledge");
      const knowledge = await knowledgeCol.find({
        companyId: hackjpn.companyId,
        $or: [
          { content: { $regex: searchText } },
          { title: { $regex: searchText } }
        ]
      }).toArray();
      console.log(`\n=== custom_knowledge (${knowledge.length}件) ===`);
      knowledge.forEach(k => {
        console.log(`- Title: ${k.title}`);
        console.log(`  Content: ${k.content?.substring(0, 200)}...`);
      });

      // 3. agentのknowledge/systemPromptを検索
      const agentsCol = db.collection("agents");
      const agent = await agentsCol.findOne({ companyId: hackjpn.companyId });
      console.log(`\n=== agent prompt settings ===`);
      if (agent?.knowledge?.includes(searchText)) {
        console.log(`- knowledge に含まれる: ${agent.knowledge.substring(0, 300)}...`);
      }
      if (agent?.systemPrompt?.includes(searchText)) {
        console.log(`- systemPrompt に含まれる: ${agent.systemPrompt.substring(0, 300)}...`);
      }
      if (agent?.companyInfo) {
        console.log(`\n=== companyInfo ===`);
        console.log(JSON.stringify(agent.companyInfo, null, 2).substring(0, 500));
        if (JSON.stringify(agent.companyInfo).includes(searchText)) {
          console.log("companyInfo に住所が含まれています！");
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
