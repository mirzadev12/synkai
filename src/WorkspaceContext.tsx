import { createContext, useContext } from "react";
import type { ServerSession } from "./serverSession";

const WorkspaceContext = createContext<ServerSession | null>(null);

export const WorkspaceProvider = WorkspaceContext.Provider;

export function useWorkspace(): ServerSession {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside a server room");
  }
  return value;
}
