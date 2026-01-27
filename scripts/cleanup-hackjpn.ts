// hackjpn 重複クリーンアップ
import { MongoClient } from "mongodb";

const MONGODB_URI = "mongodb+srv://hack:hack1204@cluster0.ay4hkb3.mongodb.net/?retryWrites=true&w=majority";
const DB_NAME = "voice_agent";

async function cleanup() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const companiesCol = db.collection("companies");
    const agentsCol = db.collection("agents");
    const docsCol = db.collection("documents");
    const chatLogsCol = db.collection("chat_logs");
    const knowledgeCol = db.collection("custom_knowledge");

    // hackjpnを全て取得
    const hackjpnCompanies = await companiesCol.find({
      name: { $regex: /^hackjpn$/i }
    }).toArray();

    console.log(`=== hackjpn 一覧 (${hackjpnCompanies.length}件) ===\n`);

    // 各会社の詳細情報を収集
    const companyDetails = [];

    for (const company of hackjpnCompanies) {
      const docCount = await docsCol.countDocuments({ companyId: company.companyId });
      const chatCount = await chatLogsCol.countDocuments({ companyId: company.companyId });
      const knowledgeCount = await knowledgeCol.countDocuments({ companyId: company.companyId });
      const agent = await agentsCol.findOne({ companyId: company.companyId });

      companyDetails.push({
        companyId: company.companyId,
        name: company.name,
        plan: company.plan || 'free',
        createdAt: company.createdAt,
        docCount,
        chatCount,
        knowledgeCount,
        hasCompanyInfo: !!agent?.companyInfo,
        address: agent?.companyInfo?.address || null
      });
    }

    // チャット数でソート（多い順）
    companyDetails.sort((a, b) => b.chatCount - a.chatCount);

    // 表示
    console.log("順位 | companyId | プラン | docs | chats | knowledge | 作成日");
    console.log("-".repeat(100));

    companyDetails.forEach((c, i) => {
      const date = c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : 'N/A';
      console.log(`${String(i + 1).padStart(2)} | ${c.companyId} | ${c.plan.padEnd(4)} | ${String(c.docCount).padStart(4)} | ${String(c.chatCount).padStart(5)} | ${String(c.knowledgeCount).padStart(9)} | ${date}`);
    });

    // 推奨：チャット数が最も多いものを残す
    const recommended = companyDetails[0];
    console.log(`\n=== 推奨: 以下を残して他を削除 ===`);
    console.log(`companyId: ${recommended.companyId}`);
    console.log(`チャット数: ${recommended.chatCount}`);
    console.log(`documents: ${recommended.docCount}`);

    // 削除対象
    const toDelete = companyDetails.slice(1);
    console.log(`\n削除対象: ${toDelete.length}件`);

    // 削除するデータの合計
    const totalDocs = toDelete.reduce((sum, c) => sum + c.docCount, 0);
    const totalChats = toDelete.reduce((sum, c) => sum + c.chatCount, 0);
    console.log(`削除されるdocuments: ${totalDocs}件`);
    console.log(`削除されるchat_logs: ${totalChats}件`);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

cleanup();
