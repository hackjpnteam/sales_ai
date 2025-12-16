import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Company } from "@/lib/types";
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

    const companiesCol = await getCollection<Company>("companies");
    const companies = await companiesCol.find({}).sort({ createdAt: -1 }).toArray();

    return NextResponse.json({ companies });
  } catch (error) {
    console.error("Failed to fetch companies:", error);
    return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 });
  }
}
