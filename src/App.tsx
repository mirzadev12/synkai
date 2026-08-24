import { LiveMap } from "@liveblocks/client";
import {
  ClientSideSuspense,
  LiveblocksProvider,
  RoomProvider,
  useErrorListener,
} from "@liveblocks/react/suspense";
import { useState } from "react";
import { Canvas } from "./Canvas";

const ROOM_ID = "synkai-shared-room";
const publicApiKey = import.meta.env.VITE_LIVEBLOCKS_PUBLIC_KEY ?? "";

function isConfiguredPublicKey(key: string) {
  if (!key.startsWith("pk_") || key.length < 24) return false;
  const lowered = key.toLowerCase();
  return (
    !lowered.includes("paste") &&
    !lowered.includes("your_key") &&
    !lowered.includes("placeholder")
  );
}

function SetupScreen({ message }: { message?: string }) {
  return (
    <div className="setup">
      <p className="brand-wordmark setup-brand">SYNKAI</p>
      <h1>{message ? "Could not connect" : "One more step"}</h1>
      {message ? <p>{message}</p> : null}
      <p>
        This app needs a free Liveblocks public key so the two browser tabs
        can talk to each other.
      </p>
      <ol>
        <li>
          Open{" "}
          <a href="https://liveblocks.io/" target="_blank" rel="noreferrer">
            liveblocks.io
          </a>{" "}
          and create a free account (Google/GitHub sign-in is fine).
        </li>
        <li>Create a project when they ask (any name is fine).</li>
        <li>
          Open <strong>API keys</strong> and copy the{" "}
          <strong>public</strong> key. It starts with <code>pk_</code>.
        </li>
        <li>
          Paste it into the file <code>.env.local</code> next to{" "}
          <code>package.json</code>, replacing the placeholder:
        </li>
      </ol>
      <pre>VITE_LIVEBLOCKS_PUBLIC_KEY=pk_your_key_here</pre>
      <p>
        Save the file, stop the app if it is running, then start it again with{" "}
        <code>npm run dev</code>.
      </p>
    </div>
  );
}

function RoomContents() {
  const [error, setError] = useState<string | null>(null);

  useErrorListener((err) => {
    setError(err.message);
  });

  if (error) {
    return <SetupScreen message={error} />;
  }

  return (
    <ClientSideSuspense fallback={<div className="loading">Connecting…</div>}>
      <Canvas />
    </ClientSideSuspense>
  );
}

export default function App() {
  if (!isConfiguredPublicKey(publicApiKey)) {
    return <SetupScreen />;
  }

  return (
    <LiveblocksProvider publicApiKey={publicApiKey} throttle={16}>
      <RoomProvider
        id={ROOM_ID}
        initialPresence={{ name: "" }}
        initialStorage={{ boxes: new LiveMap() }}
      >
        <RoomContents />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
