import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Agent } from "@/lib/types";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/admin";

export async function GET() {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // SuperAdmin権限チェック
    if (!isSuperAdmin(session.user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const agentsCol = await getCollection<Agent>("agents");
    const agents = await agentsCol.find({}).sort({ createdAt: -1 }).toArray();

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Failed to fetch agents:", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}
