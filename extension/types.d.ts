type Politeness = "polite" | "assertive" | "off";

interface Announcement {
  kind: "ariaNotify" | "live-region";
  text: string;
  politeness: Politeness;
  priority?: string;
  source: string;
  timestamp: number;
}

type ExtensionMessage = (
  | { type: "announcement"; announcement: Announcement }
  | { type: "navigated"; url: string }
) & { frameUrl?: string | null };
