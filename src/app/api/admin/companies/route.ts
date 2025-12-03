import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Company } from "@/lib/types";

export async function GET() {
  try {
    const companiesCol = await getCollection<Company>("companies");
    const companies = await companiesCol.find({}).sort({ createdAt: -1 }).toArray();

    return NextResponse.json({ companies });
  } catch (error) {
    console.error("Failed to fetch companies:", error);
    return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 });
  }
}
