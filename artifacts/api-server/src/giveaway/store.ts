import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { RoleEntryBonus } from "./commands";

export type GiveawayStatus =
  | "running"
  | "awaiting_claim"
  | "claimed"
  | "unclaimed"
  | "ended";

export interface Giveaway {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  creatorId: string;
  prize: string;
  description: string;
  requirement: string;
  roleEntryBonuses?: RoleEntryBonus[];
  createdAt: number;
  endsAt: number;
  claimTimeMs: number;
  participantIds: string[];
  selectedWinnerId?: string;
  winnerId?: string;
  claimDeadlineAt?: number;
  claimedAt?: number;
  status: GiveawayStatus;
}

export class GiveawayStore {
  private readonly filePath: string;
  private giveaways: Giveaway[];

  constructor(filePath = process.env.GIVEAWAY_DATA_FILE) {
    this.filePath = path.resolve(filePath || ".data/giveaway-bot.json");
    mkdirSync(path.dirname(this.filePath), { recursive: true });

    if (!existsSync(this.filePath)) {
      this.giveaways = [];
      return;
    }

    const parsed: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error("Giveaway data file must contain a JSON array.");
    }
    this.giveaways = parsed as Giveaway[];
  }

  all(): Giveaway[] {
    return this.giveaways;
  }

  get(id: string): Giveaway | undefined {
    return this.giveaways.find((giveaway) => giveaway.id === id);
  }

  add(giveaway: Giveaway): void {
    if (this.get(giveaway.id)) {
      throw new Error(`Giveaway "${giveaway.id}" already exists.`);
    }
    this.giveaways.push(giveaway);
    this.save();
  }

  update(id: string, change: (giveaway: Giveaway) => void): Giveaway | undefined {
    const giveaway = this.get(id);
    if (!giveaway) return undefined;
    change(giveaway);
    this.save();
    return giveaway;
  }

  private save(): void {
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(this.giveaways, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporaryPath, this.filePath);
  }
}
