"use client";

import { AgentProvider } from "../../components/AgentContext";

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AgentProvider>{children}</AgentProvider>;
}
