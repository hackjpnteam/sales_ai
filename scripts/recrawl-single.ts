import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { crawlAndEmbedSite } from "../src/lib/crawler";
import { getCollection } from "../src/lib/mongodb";

async function recrawl() {
  const companyId = process.argv[2] || "c11134ba-c958-436e-a604-fa74383dd410";
  const agentId = process.argv[3] || "9a24e30f-5109-4ed2-8b91-fb31601ba15e";
  const rootUrl = process.argv[4] || "https://www.tanteihojin.jp/english/";

  console.log("Starting recrawl for:", { companyId, agentId, rootUrl });

  // 既存ドキュメントを削除
  const docsCol = await getCollection("documents");
  const deleteResult = await docsCol.deleteMany({ companyId });
  console.log("Deleted existing documents:", deleteResult.deletedCount);

  // 再クロール実行
  const result = await crawlAndEmbedSite({
    companyId,
    agentId,
    rootUrl,
  });

  console.log("Result:", JSON.stringify(result, null, 2));
  process.exit(0);
}

recrawl().catch((e) => {
  console.error(e);
  process.exit(1);
});
