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

export const officialNameCache = sqliteTable("official_name_cache", {
  nskId: integer("nsk_id").primaryKey(),
  shikonaJp: text("shikona_jp").notNull(),
  profileUrl: text("profile_url").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

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
    rank: text("rank").notNull(),
    rankValue: integer("rank_value"),
  },
  (table) => [
    primaryKey({ columns: [table.bashoId, table.division, table.wrestlerId] }),
    index("banzuke_basho_division_idx").on(table.bashoId, table.division, table.rankValue),
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
    wrestlerAId: integer("wrestler_a_id").notNull().references(() => wrestlers.id),
    wrestlerBId: integer("wrestler_b_id").notNull().references(() => wrestlers.id),
    winnerWrestlerId: integer("winner_wrestler_id").references(() => wrestlers.id),
    kimarite: text("kimarite"),
    wrestlerAEloBefore: integer("wrestler_a_elo_before"),
    wrestlerBEloBefore: integer("wrestler_b_elo_before"),
    wrestlerAEloAfter: integer("wrestler_a_elo_after"),
    wrestlerBEloAfter: integer("wrestler_b_elo_after"),
  },
  (table) => [
    index("bouts_order_idx").on(table.bashoId, table.day, table.division),
    index("bouts_wrestler_a_idx").on(table.wrestlerAId, table.bashoId, table.day),
    index("bouts_wrestler_b_idx").on(table.wrestlerBId, table.bashoId, table.day),
  ],
);

export const ratingImportBatches = sqliteTable("rating_import_batches", {
  batchId: text("batch_id").primaryKey(),
  tableName: text("table_name").notNull(),
  rowCount: integer("row_count").notNull(),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

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

export const predictionRecords = sqliteTable(
  "prediction_records",
  {
    id: text("id").primaryKey(),
    bashoId: integer("basho_id").notNull(),
    day: integer("day").notNull(),
    division: integer("division").notNull(),
    eastNskId: integer("east_nsk_id").notNull(),
    westNskId: integer("west_nsk_id").notNull(),
    modelVersion: text("model_version").notNull(),
    eloEastBp: integer("elo_east_bp").notNull(),
    glickoEastBp: integer("glicko_east_bp").notNull(),
    dohyoV2EastBp: integer("dohyo_v2_east_bp").notNull(),
    dohyoV3EastBp: integer("dohyo_v3_east_bp"),
    winnerNskId: integer("winner_nsk_id"),
    predictedAt: text("predicted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("prediction_records_basho_idx").on(table.bashoId, table.day, table.division),
    index("prediction_records_unresolved_idx").on(table.winnerNskId, table.bashoId),
  ],
);
