import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Agent } from "@/lib/types";

export async function GET() {
  try {
    const agentsCol = await getCollection<Agent>("agents");
    const agents = await agentsCol.find({}).sort({ createdAt: -1 }).toArray();

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Failed to fetch agents:", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}
