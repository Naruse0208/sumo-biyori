import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const wrestlers = sqliteTable(
  "wrestlers",
  {
    id: integer("id").primaryKey(),
    sumodbId: integer("sumodb_id"),
    nskId: integer("nsk_id"),
    shikonaJp: text("shikona_jp"),
    shikonaEn: text("shikona_en").notNull(),
    heya: text("heya"),
    birthDate: text("birth_date"),
    shusshin: text("shusshin"),
    heightMm: integer("height_mm"),
    weightKg: integer("weight_kg"),
    debutBashoId: integer("debut_basho_id"),
    intaiDate: text("intai_date"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("wrestlers_sumodb_id_uq").on(table.sumodbId),
    uniqueIndex("wrestlers_nsk_id_uq").on(table.nskId),
    index("wrestlers_shikona_jp_idx").on(table.shikonaJp),
  ],
);

export const shikonaHistory = sqliteTable(
  "shikona_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    wrestlerId: integer("wrestler_id").notNull().references(() => wrestlers.id),
    shikonaJp: text("shikona_jp"),
    shikonaEn: text("shikona_en").notNull(),
    startBashoId: integer("start_basho_id"),
    endBashoId: integer("end_basho_id"),
  },
  (table) => [
    index("shikona_history_wrestler_idx").on(table.wrestlerId, table.startBashoId),
  ],
);

export const basho = sqliteTable("basho", {
  id: integer("id").primaryKey(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  location: text("location"),
  sourceUrl: text("source_url"),
  retrievedAt: text("retrieved_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const banzukeEntries = sqliteTable(
  "banzuke_entries",
  {
    bashoId: integer("basho_id").notNull().references(() => basho.id),
    division: integer("division").notNull(),
    wrestlerId: integer("wrestler_id").notNull().references(() => wrestlers.id),
    side: integer("side").notNull(),
    rankCode: text("rank_code").notNull(),
    rankNumber: integer("rank_number"),
  },
  (table) => [
    primaryKey({ columns: [table.bashoId, table.division, table.wrestlerId] }),
    index("banzuke_basho_division_idx").on(table.bashoId, table.division, table.rankNumber),
    index("banzuke_wrestler_idx").on(table.wrestlerId, table.bashoId),
  ],
);

export const bouts = sqliteTable(
  "bouts",
  {
    id: text("id").primaryKey(),
    bashoId: integer("basho_id").notNull().references(() => basho.id),
    division: integer("division").notNull(),
    day: integer("day").notNull(),
    matchNo: integer("match_no").notNull(),
    eastWrestlerId: integer("east_wrestler_id").notNull().references(() => wrestlers.id),
    westWrestlerId: integer("west_wrestler_id").notNull().references(() => wrestlers.id),
    winnerWrestlerId: integer("winner_wrestler_id").references(() => wrestlers.id),
    eastRank: text("east_rank"),
    westRank: text("west_rank"),
    kimarite: text("kimarite"),
    eastEloBefore: integer("east_elo_before"),
    westEloBefore: integer("west_elo_before"),
    eastEloAfter: integer("east_elo_after"),
    westEloAfter: integer("west_elo_after"),
  },
  (table) => [
    uniqueIndex("bouts_order_uq").on(table.bashoId, table.division, table.day, table.matchNo),
    index("bouts_east_wrestler_idx").on(table.eastWrestlerId, table.bashoId, table.day),
    index("bouts_west_wrestler_idx").on(table.westWrestlerId, table.bashoId, table.day),
  ],
);

export const ratingSnapshots = sqliteTable(
  "rating_snapshots",
  {
    wrestlerId: integer("wrestler_id").notNull().references(() => wrestlers.id),
    bashoId: integer("basho_id").notNull().references(() => basho.id),
    division: integer("division").notNull(),
    elo: integer("elo").notNull(),
    peakElo: integer("peak_elo").notNull(),
    dohyoScoreTenths: integer("dohyo_score_tenths").notNull(),
    bouts: integer("bouts").notNull(),
    wins: integer("wins").notNull(),
    losses: integer("losses").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.wrestlerId, table.bashoId] }),
    index("rating_snapshots_leaderboard_idx").on(table.bashoId, table.division, table.elo),
    index("rating_snapshots_wrestler_idx").on(table.wrestlerId, table.bashoId),
  ],
);
